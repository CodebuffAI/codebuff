import z from 'zod/v4'

import { boundedTransactionEditListSchema } from './edit-transaction'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'
import { proposalResultV1Schema } from '../../results/filesystem'

import type { $ToolParams } from '../../constants'

export const proposeEditTransactionResultSchema = z.union([
  proposalResultV1Schema,
  z.object({
    message: z.string(),
    files: z.array(
      z.object({
        file: z.string(),
        unifiedDiff: z.string(),
        messages: z.array(z.string()),
      }),
    ),
  }),
  z.object({
    errorMessage: z.string(),
    failures: z.array(
      z.object({
        editIndex: z.number().int().min(-1),
        id: z.string().optional(),
        path: z.string(),
        errorMessage: z.string(),
      }),
    ),
  }),
])

const toolName = 'propose_edit_transaction'
const endsAgentStep = false
const inputSchema = z
  .object({
    edits: boundedTransactionEditListSchema.describe(
      'All edits that must preflight together. If any edit fails during preflight, no preview diffs are produced.',
    ),
  })
  .describe(
    'Propose related edits across one or more files as one preflighted bundle without applying them, returning preview diffs for review.',
  )

const description = `
Propose related edits across one or more files as one preflighted bundle without applying them. Use this tool when drafting a multi-file change that should be reviewed as one coherent bundle before being applied.

This tool works identically to edit_transaction's preflight, but the changes are NOT written to disk. Instead, it returns the unified diff of what would change for each affected file. Multiple propose calls on the same files stack correctly.

Important:
- Every edit preflights against in-memory file contents first.
- If ANY edit fails during preflight, NO preview diffs are produced.
- Structured edits are dispatched deterministically by operation kind; supported operations include insert_text, insert_import, and remove_import.
- Use insert_import/remove_import for TypeScript import-only changes; use str_replace for larger semantic changes.
- Large-file str_replace replacements still require basedOnRead from fresh read_files.ranges output.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    edits: [
      {
        id: 'update-helper',
        type: 'str_replace',
        path: 'src/helper.ts',
        replacements: [
          {
            oldString: 'export const value = 1',
            newString: 'export const value = 2',
          },
        ],
      },
      {
        id: 'update-helper-test',
        type: 'str_replace',
        path: 'src/helper.test.ts',
        replacements: [
          {
            oldString: 'expect(value).toBe(1)',
            newString: 'expect(value).toBe(2)',
          },
        ],
      },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const proposeEditTransactionParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(proposeEditTransactionResultSchema),
} satisfies $ToolParams
