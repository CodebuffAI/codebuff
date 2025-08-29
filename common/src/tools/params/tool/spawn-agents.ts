import z from 'zod/v4'

import { jsonObjectSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

export const spawnAgentsOutputSchema = z
  .object({
    agentType: z.string(),
  })
  .and(jsonObjectSchema)
  .array()

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
    .describe(
      `Spawn multiple agents and send a prompt and/or parameters to each of them. These agents will run in parallel. Note that that means they will run independently. If you need to run agents sequentially, use spawn_agents with one agent at a time instead.`,
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: spawnAgentsOutputSchema,
    }),
  ]),
} satisfies $ToolParams
