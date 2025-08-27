import z from 'zod/v4'

import { terminalCommandOutputSchema } from './run-terminal-command'

import type { $ToolParams } from '../../constants'

const toolName = 'run_file_change_hooks'
const endsAgentStep = true
export const runFileChangeHooksParams = {
  toolName,
  endsAgentStep,
  parameters: z.object({
    files: z
      .array(z.string())
      .describe(
        `List of file paths that were changed and should trigger file change hooks`,
      ),
  }),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: terminalCommandOutputSchema.and(
        z.object({
          hookName: z.string(),
        }),
      ),
    }),
  ]),
} satisfies $ToolParams
