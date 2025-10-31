import z from 'zod/v4'

import { jsonValueSchema } from '../../../types/json'
import type { $ToolParams } from '../../constants'

const toolName = 'lookup_agent_info'
const endsAgentStep = false
export const lookupAgentInfoParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      agentId: z
        .string()
        .describe('Agent ID (short local or full published format)'),
    })
    .describe('Retrieve information about an agent by ID'),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: jsonValueSchema,
    }),
  ]),
} satisfies $ToolParams
