import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import { updateFileResultSchema } from './str-replace'

import type { $ToolParams } from '../../constants'

const toolName = 'replace_range'
const endsAgentStep = false

const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe('The path to the file to edit.'),
    startLine: z
      .number()
      .int()
      .min(1)
      .describe('1-indexed inclusive start line from a fresh read_files.ranges result.'),
    endLine: z
      .number()
      .int()
      .min(1)
      .describe('1-indexed inclusive end line from a fresh read_files.ranges result.'),
    expectedHash: z
      .string()
      .min(1)
      .describe('The sha256 rangeHash returned by read_files.ranges for this exact range.'),
    newContent: z
      .string()
      .describe('Complete replacement content for the selected line range.'),
  })
  .refine((input) => input.startLine <= input.endLine, {
    message: 'startLine must be <= endLine',
  })
  .describe('Replace a previously read line range only if its hash still matches.')

const description = `
Use this tool for reliable edits to medium and large files after reading an exact line range with read_files.ranges.

Important:
- Do not guess startLine/endLine/hash. Copy them from a fresh read_files.ranges header.
- Do not include a trailing phantom line beyond the visible file length; if a stale-range diagnostic reports the current file length, re-read with endLine <= that line count.
- The runtime verifies the current range hash before editing and rejects stale edits before changing the file.
- newContent replaces the entire selected range, so include all lines that should remain in that range.
- Prefer this over str_replace for large-file function/block edits or line-count-changing changes.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'path/to/large-file.ts',
    startLine: 120,
    endLine: 135,
    expectedHash: 'sha256:abc123',
    newContent: 'function updated() {\n  return true\n}',
  },
  endsAgentStep,
})}
`.trim()

export const replaceRangeParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
