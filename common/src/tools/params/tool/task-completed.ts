import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'task_completed'
const endsAgentStep = true
export const taskCompletedParams = {
  toolName,
  endsAgentStep,
  parameters: z.object({}).describe(
    `Signal that the task is complete. Use this tool when:
- The user's request is completely fulfilled
- You need clarification from the user before continuing
- You are stuck or need help from the user to continue

This tool explicitly marks the end of your work on the current task.`,
  ),
  outputs: z.tuple([]),
} satisfies $ToolParams
