import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
} from '../utils'
import {
  readFilesResultV1Schema,
  readFilesSliceSchema,
} from '../../results/filesystem'

import type { $ToolParams } from '../../constants'

export const fileContentsSchema = z.union([
  z.object({
    summary: z.object({
      ok: z.number(),
      failed: z.number(),
      requested: z.number(),
    }),
  }),
  z.object({
    path: z.string(),
    content: z.string(),
    referencedBy: z.record(z.string(), z.string().array()).optional(),
  }),
  z.object({
    path: z.string(),
    contentOmittedForLength: z.literal(true),
  }),
  z.object({
    path: z.string(),
    slices: z.array(readFilesSliceSchema),
    errorMessage: z.string().optional(),
  }),
])

const toolName = 'read_files'
const endsAgentStep = true
const decodeFragmentedSymbolSelectors = (input: unknown): unknown => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const record = input as Record<string, unknown>
  if (!Array.isArray(record.symbols) || record.symbols.length === 0)
    return input
  if (!record.symbols.every((value) => typeof value === 'string')) return input

  const encoded = (record.symbols as string[]).join(',')
  try {
    const decoded = JSON.parse(encoded) as unknown
    if (!Array.isArray(decoded)) return input
    return { ...record, symbols: decoded }
  } catch {
    return input
  }
}

const inferSingleSelectorPath = (input: unknown): unknown => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const record = input as Record<string, unknown>
  const paths = Array.isArray(record.paths)
    ? record.paths
    : typeof record.paths === 'string'
      ? [record.paths]
      : []
  if (paths.length !== 1 || typeof paths[0] !== 'string') return input
  let inferredPath = false
  const inferPath = (selectors: unknown): unknown => {
    if (!Array.isArray(selectors)) return selectors
    return selectors.map((selector) => {
      if (
        !selector ||
        typeof selector !== 'object' ||
        Array.isArray(selector)
      ) {
        return selector
      }
      const selectorRecord = selector as Record<string, unknown>
      if (selectorRecord.path !== undefined) return selector
      inferredPath = true
      return { ...selectorRecord, path: paths[0] }
    })
  }
  const ranges = inferPath(record.ranges)
  const symbols = inferPath(record.symbols)
  if (!inferredPath) return input

  // The sole path is acting as shorthand for the scoped selector, not as a
  // second whole-file selector. This also recovers the common model shape
  // `{ paths: [file], symbols: [{ names }] }` without weakening ambiguous
  // multi-file validation.
  return { ...record, paths: [], ranges, symbols }
}

const inputSchema = z
  .preprocess(
    (input) => inferSingleSelectorPath(decodeFragmentedSymbolSelectors(input)),
    z.object({
      paths: z
        .preprocess(
          coerceToArray,
          z.array(
            z
              .string()
              .min(1, 'Paths cannot be empty')
              .describe(
                `File path to read relative to the **project root**. Absolute file paths will not work.`,
              ),
          ),
        )
        .optional()
        .default([])
        .describe(
          'List of file paths to read. Each complete result includes a readCapability that can be copied directly to basedOnRead for a follow-up edit. Batch results include a separate summary entry with ok/failed/requested counts when available.',
        ),
      ranges: z
        .array(
          z.object({
            path: z
              .string()
              .min(1)
              .describe(
                'File path to read a line range from, relative to the project root.',
              ),
            startLine: z
              .number()
              .int()
              .min(1)
              .optional()
              .describe('1-indexed inclusive start line. Defaults to 1.'),
            endLine: z
              .number()
              .int()
              .min(1)
              .optional()
              .describe(
                '1-indexed inclusive end line. Defaults to the last line.',
              ),
          }),
        )
        .optional()
        .describe(
          'Optional: read only a 1-indexed inclusive line range of specific files. Use this to page through large files that exceeded the read limit. Each entry reads `path` from startLine..endLine. When exactly one paths entry is supplied, a missing range path is inferred from it.',
        ),
      symbols: z
        .array(
          z.object({
            path: z
              .string()
              .min(1)
              .describe(
                'File path to extract symbol slices from, relative to the project root.',
              ),
            names: z
              .preprocess(coerceToArray, z.array(z.string().min(1)))
              .describe(
                'Symbol names (functions, classes, interfaces, methods) to slice.',
              ),
          }),
        )
        .optional()
        .describe(
          'Optional: instead of (or in addition to) whole files, pull just the implementation slices for named symbols. Prefer this over a full read when you already know which functions/classes you need, especially in large files. Each returned slice includes one editAnchor whose readCapability can anchor a later edit.',
        ),
    }),
  )
  .superRefine((value, ctx) => {
    if (
      value.paths.length === 0 &&
      (value.ranges?.length ?? 0) === 0 &&
      (value.symbols?.length ?? 0) === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['paths'],
        message:
          'read_files requires at least one path, range, or symbol selector.',
      })
    }
  })
  .describe(
    `Read multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.`,
  )
const description = `
Read files from disk. For large files, prefer ranges or symbol slices over full-file reads before editing.

Important:
- Full reads may be truncated for large files; the truncation marker includes the original character and line counts. Do not edit from truncated content.
- Every complete read returns one structured editAnchor containing startLine, endLine, contentHash, and an authenticated cap.v3 readCapability bound to this project, path, and agent run. Copy editAnchor.readCapability verbatim to basedOnRead/readCapability; use the other fields for diagnostics only and never mix them into the same edit call.
- Symbol slices: pass \`symbols: [{ path, names }]\` to pull just the named functions/classes/methods instead of the whole file. Prefer this when you already know the symbol names — pair it with read_outline to discover names in a large file first (outline to see structure, then symbols to pull what you need). Use \`ranges\` when you're paging by line number instead.
- Model-visible complete reads expose one editAnchor rather than duplicate top-level hash/capability fields.
- Complete range results also return sourceContent containing the exact undecorated normalized range text used for the range hash. Use sourceContent—not the numbered display content—when an exact oldString is truly needed. Never splice a mid-line suffix together with following lines; that is not contiguous source text.
- For a medium/large or formatting-sensitive block, use an edit_transaction replace_range edit and copy editAnchor.readCapability directly instead of reconstructing oldString or separate range fields.
- For a large-file str_replace edit inside edit_transaction, copy editAnchor.readCapability into basedOnRead.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    paths: ['path/to/file1.ts', 'path/to/file2.ts'],
    ranges: [{ path: 'path/to/large-file.ts', startLine: 120, endLine: 160 }],
    symbols: [{ path: 'path/to/large-file.ts', names: ['loadConfig'] }],
  },
  endsAgentStep,
})}
`.trim()
export const readFilesParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([readFilesResultV1Schema, fileContentsSchema.array()]),
  ),
} satisfies $ToolParams
