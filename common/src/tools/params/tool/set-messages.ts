import z from 'zod/v4'

import { validateToolParams } from '../../constants'
import { $getToolCallString, emptyToolResultSchema } from '../utils'

const toolName = 'set_messages'
const endsAgentStep = true
const inputSchema = z
  .object({
    messages: z.any(),
  })
  .describe(`Set the conversation history to the provided messages.`)
const description = `
Example:
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    messages: [
      {
        role: 'user',
        content: 'Hello, how are you?',
      },
      {
        role: 'assistant',
        content: 'I am fine, thank you.',
      },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const setMessagesParams = validateToolParams({
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: emptyToolResultSchema(),
})
