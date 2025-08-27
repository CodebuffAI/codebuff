import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

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
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z
        .discriminatedUnion('success', [
          z.object({
            agentType: z.string(),
            success: z.literal(true),
            agentId: z.string(),
          }),
          z.object({
            agentType: z.string(),
            success: z.literal(false),
            errorMessage: z.string(),
          }),
        ])
        .array(),
    }),
  ]),
} satisfies $ToolParams
