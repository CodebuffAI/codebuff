import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'run_file_change_hooks'
const endsAgentStep = true
export const runFileChangeHooksParams = {
  toolName,
  endsAgentStep,
  parameters: z.object({
    files: z
      .array(z.string())
      .describe(
        `List of file paths that were changed and should trigger file change hooks`
      ),
  }),
} satisfies ToolParams
