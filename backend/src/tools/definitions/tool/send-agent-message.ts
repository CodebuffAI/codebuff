import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'send_agent_message'
const endsAgentStep = false
export const sendAgentMessageTool = {
  toolName,
  description: `
Use this tool to send messages between agents in an async agent hierarchy. This enables parent-child communication and data exchange.

- Use target_agent_id "PARENT_ID" to send messages to the parent agent
- Use the actual agent ID to send messages to specific child agents
- The prompt field contains the message content
- The params field can contain structured data

Example:
${getToolCallString(toolName, {
  target_agent_id: 'PARENT_ID',
  prompt: 'Found 5 authentication-related files',
  params: JSON.stringify({
    files: ['src/auth.ts', 'src/login.ts'],
    confidence: 0.9,
  }),
})}
    `.trim(),
} satisfies ToolDescription
