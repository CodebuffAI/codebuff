import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

const toolName = 'add_message'
const endsAgentStep = true
export const addMessageTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
    .describe(
      `Add a new message to the conversation history. To be used for complex requests that can't be solved in a single step, as you may forget what happened!`
    ),
  description: `
Example:
    ${getToolCallString(
      toolName,
      {
        role: 'user',
        content: 'Hello, how are you?',
      },
      endsAgentStep
    )}
  `.trim(),
} satisfies CodebuffToolDef
