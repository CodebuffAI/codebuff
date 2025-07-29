import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'set_messages'
const endsAgentStep = true
export const setMessagesTool = {
  toolName,
  description: `
Example:
    ${getToolCallString(toolName, {
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
    })}
  `.trim(),
} satisfies ToolDescription
