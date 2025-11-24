import z from 'zod/v4'

import { validateToolParams } from '../../constants'
import { $getToolCallString, jsonToolResultSchema } from '../utils'

const toolName = 'update_subgoal'
const endsAgentStep = false
const inputSchema = z
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
  )
const description = `
Examples:

Usage 1 (update status):
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    id: '1',
    status: 'COMPLETE',
  },
  endsAgentStep,
})}

Usage 2 (update plan):
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    id: '3',
    plan: 'Create file for endpoint in the api. Register it in the router.',
  },
  endsAgentStep,
})}

Usage 3 (add log):
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    id: '1',
    log: 'Found the error in the tests. Culprit: foo function.',
  },
  endsAgentStep,
})}

Usage 4 (update status and add log):
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    id: '1',
    status: 'COMPLETE',
    log: 'Reran the tests (passed)',
  },
  endsAgentStep,
})}
`.trim()

export const updateSubgoalParams = validateToolParams({
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.object({
      message: z.string(),
    }),
  ),
})
