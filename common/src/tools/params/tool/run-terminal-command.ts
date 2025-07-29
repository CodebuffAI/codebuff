import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'run_terminal_command'
const endsAgentStep = true
export const runTerminalCommandParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      // Can be empty to use it for a timeout.
      command: z
        .string()
        .min(1, 'Command cannot be empty')
        .describe(`CLI command valid for user's OS.`),
      process_type: z
        .enum(['SYNC', 'BACKGROUND'])
        .default('SYNC')
        .describe(
          `Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC`
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          `The working directory to run the command in. Default is the project root.`
        ),
      timeout_seconds: z
        .number()
        .default(30)
        .describe(
          `Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30`
        ),
    })
    .describe(
      `Execute a CLI command from the **project root** (different from the user's cwd).`
    ),
} satisfies ToolParams
