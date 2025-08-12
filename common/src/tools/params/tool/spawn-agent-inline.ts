import z from 'zod/v4'

import type { ToolParams } from '../../constants'

const toolName = 'spawn_agent_inline'
const endsAgentStep = true
export const spawnAgentInlineParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      agent_type: z.string().describe('Agent to spawn'),
      prompt: z.string().optional().describe('Prompt to send to the agent'),
      params: z
        .record(z.string(), z.any())
        .optional()
        .describe('Parameters object for the agent (if any)'),
    })
    .describe(`Spawn a single agent that runs within the current message history.`),
} satisfies ToolParams