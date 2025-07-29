import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'send_agent_message'
const endsAgentStep = false
export const sendAgentMessageParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      target_agent_id: z
        .string()
        .describe(
          'ID of the target agent to send message to. Use "PARENT_ID" to send to parent agent.'
        ),
      prompt: z.string().describe('Message prompt to send to the target agent'),
      params: z
        .record(z.string(), z.any())
        .optional()
        .describe('Optional parameters object to send with the message'),
    })
    .describe(
      `Send a message to another agent (parent or child) for communication and data exchange.`
    ),
} satisfies ToolParams
