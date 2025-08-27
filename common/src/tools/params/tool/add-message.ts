import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'add_message'
const endsAgentStep = true
export const addMessageParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
    .describe(
      `Add a new message to the conversation history. To be used for complex requests that can't be solved in a single step, as you may forget what happened!`,
    ),
  outputs: z.tuple([]),
} satisfies $ToolParams
