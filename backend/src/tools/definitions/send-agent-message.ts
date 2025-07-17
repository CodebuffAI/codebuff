import z from 'zod/v4'

import { getToolCallString } from '@codebuff/common/constants/tools'

import { CodebuffToolDef } from '../constants'

export const sendAgentMessageTool = {
  toolName: 'send_agent_message',
  endsAgentStep: false,
  parameters: z
    .object({
      target_agent_id: z.string().describe('ID of the target agent to send message to. Use "PARENT_ID" to send to parent agent.'),
      prompt: z.string().describe('Message prompt to send to the target agent'),
      params: z
        .record(z.string(), z.any())
        .optional()
        .describe('Optional parameters object to send with the message'),
    })
    .describe(`Send a message to another agent (parent or child) for communication and data exchange.`),
  description: `
Use this tool to send messages between agents in an async agent hierarchy. This enables parent-child communication and data exchange.

- Use target_agent_id "PARENT_ID" to send messages to the parent agent
- Use the actual agent ID to send messages to specific child agents
- The prompt field contains the message content
- The params field can contain structured data

Example:
${getToolCallString('send_agent_message', {
  target_agent_id: 'PARENT_ID',
  prompt: 'Found 5 authentication-related files',
  params: JSON.stringify({ 
    files: ['src/auth.ts', 'src/login.ts'],
    confidence: 0.9 
  }),
})}
    `.trim(),
} satisfies CodebuffToolDef
