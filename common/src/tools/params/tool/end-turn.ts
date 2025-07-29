import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'end_turn'
const endsAgentStep = true
export const endTurnParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({})
    .describe(
      `End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.`
    ),
} satisfies ToolParams
