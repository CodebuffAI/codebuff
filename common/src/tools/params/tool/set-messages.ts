import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'set_messages'
const endsAgentStep = true
export const setMessagesParams = {
  toolName,
  endsAgentStep,
  inputSchema: z
    .object({
      messages: z.any(),
    })
    .describe(`Set the conversation history to the provided messages.`),
  outputSchema: z.tuple([]),
} satisfies $ToolParams
