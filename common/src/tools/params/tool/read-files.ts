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
const inputSchema = z
  .object({
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
        'List of file paths to read. Batch results include a separate summary entry with ok/failed/requested counts when available.',
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
        'Optional: read only a 1-indexed inclusive line range of specific files. Use this to page through large files that exceeded the read limit. Each entry reads `path` from startLine..endLine.',
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
        'Optional: instead of (or in addition to) whole files, pull just the implementation slices for named symbols. Prefer this over a full read when you already know which functions/classes you need, especially in large files. Each returned slice includes its line range and a readCapability you can reuse as basedOnRead on a later edit.',
      ),
  })
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
- Symbol slices: pass \`symbols: [{ path, names }]\` to pull just the named functions/classes/methods (each with its line range and a readCapability) instead of the whole file. Prefer this when you already know the symbol names — pair it with read_outline to discover names in a large file first (outline to see structure, then symbols to pull what you need). Use \`ranges\` when you're paging by line number instead.
- Range reads return a header with startLine, endLine, and rangeHash.
- Use replace_range for medium/large line-count-changing edits, copying expectedHash from rangeHash.
- For large-file str_replace, copy basedOnRead from a fresh range read or symbol slice: startLine, endLine, hash: rangeHash (or the slice's readCapability).
- For large-file apply_patch, include basedOnRead capabilities for every touched hunk, copied from fresh range read headers.

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
