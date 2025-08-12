import z from 'zod/v4'

import type { ToolParams } from '../../constants'

const toolName = 'create_plan'
const endsAgentStep = false
export const createPlanParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      path: z
        .string()
        .min(1, 'Path cannot be empty')
        .describe(
          `The path including the filename of a markdown file that will be overwritten with the plan.`,
        ),
      plan: z
        .string()
        .min(1, 'Plan cannot be empty')
        .describe(`A detailed plan to solve the user's request.`),
    })
    .describe(`Generate a detailed markdown plan for complex tasks.`),
} satisfies ToolParams
