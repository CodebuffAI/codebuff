import z from 'zod'

import type { ToolParams } from '../../constants'

const toolName = 'end_turn'
const endsAgentStep = true
export const endTurnParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({})
    .describe(
      `End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.`,
    ),
} satisfies ToolParams
