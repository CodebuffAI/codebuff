import z from 'zod/v4'

import type { ToolParams } from '../../constants'

const toolName = 'update_subgoal'
const endsAgentStep = false
export const updateSubgoalParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      id: z
        .string()
        .min(1, 'Id cannot be empty')
        .describe(`The id of the subgoal to update.`),
      status: z
        .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'])
        .optional()
        .describe(`Change the status of the subgoal.`),
      plan: z.string().optional().describe(`Change the plan for the subgoal.`),
      log: z
        .string()
        .optional()
        .describe(
          `Add a log message to the subgoal. This will create a new log entry and append it to the existing logs. Use this to record your progress and any new information you learned as you go.`,
        ),
    })
    .describe(
      `Update a subgoal in the context given the id, and optionally the status or plan, or a new log to append. Feel free to update any combination of the status, plan, or log in one invocation.`,
    ),
} satisfies ToolParams
