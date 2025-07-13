import z from 'zod/v4'

import { getToolCallString } from '@codebuff/common/constants/tools'

import { CodebuffToolDef } from '../constants'

export const addSubgoalTool = {
  toolName: 'add_subgoal',
  endsAgentStep: false,
  parameters: z
    .object({
      id: z
        .string()
        .min(1, 'Id cannot be empty')
        .describe(
          `A unique identifier for the subgoal. Try to choose the next sequential integer that is not already in use.`
        ),
      objective: z
        .string()
        .min(1, 'Objective cannot be empty')
        .describe(
          `The objective of the subgoal, concisely and clearly stated.`
        ),
      status: z
        .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'])
        .describe(`The status of the subgoal.`),
      plan: z.string().optional().describe('A plan for the subgoal.'),
      log: z
        .string()
        .optional()
        .describe('A log message for the subgoal progress.'),
    })
    .describe(
      `Add a new subgoal for tracking progress. To be used for complex requests that can't be solved in a single step, as you may forget what happened!`
    ),

  description: `
Example:
${getToolCallString('add_subgoal', {
  id: '1',
  objective: 'Add a new "deploy api" subgoal',
  status: 'IN_PROGRESS',
})}
`.trim(),
} satisfies CodebuffToolDef
