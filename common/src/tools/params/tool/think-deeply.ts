import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'think_deeply'
const endsAgentStep = false
export const thinkDeeplyParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      thought: z
        .string()
        .min(1, 'Thought cannot be empty')
        .describe(
          `Detailed step-by-step analysis. Initially keep each step concise (max ~5-7 words per step).`,
        ),
    })
    .describe(
      `Deeply consider complex tasks by brainstorming approaches and tradeoffs step-by-step.`,
    ),
  outputs: z.tuple([]),
} satisfies $ToolParams
