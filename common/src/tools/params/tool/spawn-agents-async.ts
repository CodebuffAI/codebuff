import z from 'zod'

import type { ToolParams } from '../../constants'

const toolName = 'spawn_agents_async'
const endsAgentStep = false
export const spawnAgentsAsyncParams = {
  toolName,
  endsAgentStep,
  parameters: z.object({
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
  }),
} satisfies ToolParams
