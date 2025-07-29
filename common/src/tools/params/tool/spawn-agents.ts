import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'spawn_agents'
const endsAgentStep = true
export const spawnAgentsParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      agents: z
        .object({
          agent_type: z.string().describe('Agent to spawn'),
          prompt: z.string().optional().describe('Prompt to send to the agent'),
          params: z
            .record(z.string(), z.any())
            .optional()
            .describe('Parameters object for the agent (if any)'),
        })
        .array(),
    })
    .describe(`Spawn multiple agents and send a prompt to each of them.`),
} satisfies ToolParams
