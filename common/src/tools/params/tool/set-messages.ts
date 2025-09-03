import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'set_messages'
const endsAgentStep = true
export const setMessagesParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      messages: z.any(),
    })
    .describe(`Set the conversation history to the provided messages.`),
  outputs: z.tuple([]),
} satisfies $ToolParams
