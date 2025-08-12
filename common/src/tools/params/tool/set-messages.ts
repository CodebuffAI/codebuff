import z from 'zod/v4'

import type { ToolParams } from '../../constants'

const toolName = 'set_messages'
const endsAgentStep = true
export const setMessagesParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      messages: z.array(
        z
          // Make sure to pass through any additional properties!
          .looseObject({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          }),
      ),
    })
    .describe(`Set the conversation history to the provided messages.`),
} satisfies ToolParams
