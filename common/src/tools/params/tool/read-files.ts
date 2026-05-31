import z from 'zod/v4'

import { $getNativeToolCallExampleString, coerceToArray, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const fileContentsSchema = z.union([
  z.object({
    path: z.string(),
    content: z.string(),
    referencedBy: z.record(z.string(), z.string().array()).optional(),
  }),
  z.object({
    path: z.string(),
    contentOmittedForLength: z.literal(true),
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
      .describe('List of file paths to read.'),
    ranges: z
      .array(
        z.object({
          path: z
            .string()
            .min(1)
            .describe('File path to read a line range from, relative to the project root.'),
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
            .describe('1-indexed inclusive end line. Defaults to the last line.'),
        }),
      )
      .optional()
      .describe(
        'Optional: read only a 1-indexed inclusive line range of specific files. Use this to page through large files that exceeded the read limit. Each entry reads `path` from startLine..endLine.',
      ),
  })
  .describe(
    `Read multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.`,
  )
const description = `
Read files from disk. For large files, prefer ranges over full-file reads before editing.

Important:
- Full reads may be truncated for large files; do not edit from truncated content.
- Range reads return a header with startLine, endLine, and rangeHash.
- Use replace_range for medium/large line-count-changing edits, copying expectedHash from rangeHash.
- For large-file str_replace, copy basedOnRead from a fresh range read: startLine, endLine, hash: rangeHash.
- For large-file apply_patch, include basedOnRead capabilities for every touched hunk, copied from fresh range read headers.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    paths: ['path/to/file1.ts', 'path/to/file2.ts'],
    ranges: [{ path: 'path/to/large-file.ts', startLine: 120, endLine: 160 }],
  },
  endsAgentStep,
})}
`.trim()
export const readFilesParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(fileContentsSchema.array()),
} satisfies $ToolParams
