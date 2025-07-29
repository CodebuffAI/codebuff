import type { ToolParams } from '../../constants'

import z from 'zod/v4'

const toolName = 'set_output'
const endsAgentStep = false
export const setOutputParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({})
    .passthrough()
    .describe(
      'JSON object to set as the agent output. This completely replaces any previous output. If the agent was spawned, this value will be passed back to its parent. If the agent has an outputSchema defined, the output will be validated against it.'
    ),
} satisfies ToolParams
