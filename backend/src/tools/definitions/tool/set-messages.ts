import type { CodebuffToolDef } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'

const toolName = 'set_messages'
const endsAgentStep = true
export const setMessagesTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      messages: z.array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })
      ),
    })
    .describe(`Set the conversation history to the provided messages.`),
  description: `
Example:
    ${getToolCallString(
      toolName,
      {
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
      endsAgentStep
    )}
  `.trim(),
} satisfies CodebuffToolDef
