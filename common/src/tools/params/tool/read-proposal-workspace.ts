import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

export const readProposalWorkspaceResultSchema = z.union([
  z.object({
    path: z.string(),
    /** Where the returned content came from. */
    source: z.enum(['proposal', 'disk']),
    content: z.string(),
  }),
  z.object({
    path: z.string(),
    errorMessage: z.string(),
  }),
])

const toolName = 'read_proposal_workspace'
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
      .describe('List of file paths to read from the proposal workspace.'),
  })
  .describe(
    `Read files from your in-progress proposal workspace (your own proposed changes), not the real on-disk workspace.`,
  )
const description = `
Read files from your in-progress proposal workspace instead of the real on-disk workspace.

Use this tool (NOT read_files) once you have started proposing edits, so you always see your own proposed changes:
- If you have already proposed edits to a file (via propose_str_replace / propose_write_file / propose_edit_transaction), this returns the CURRENT proposed content of that file ("source": "proposal"). This is your "read your own writes" view.
- If you have NOT yet proposed any edit to a file, this falls back to the real file on disk ("source": "disk") so you can still gather context before editing it.

This prevents a proposal from getting stuck recreating changes it already made: your proposed edits are never discarded between steps, and reading a file you already edited will show the proposed result rather than the unchanged disk content.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    paths: ['src/a.ts', 'src/b.ts'],
  },
  endsAgentStep,
})}
`.trim()

export const readProposalWorkspaceParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(readProposalWorkspaceResultSchema.array()),
} satisfies $ToolParams
