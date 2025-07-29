import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'add_message'
export const addMessageTool = {
  toolName,
  description: `
Example:
    ${getToolCallString(toolName, {
      role: 'user',
      content: 'Hello, how are you?',
    })}
  `.trim(),
} satisfies ToolDescription
