import z from 'zod/v4'

import { $getNativeToolCallExampleString } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'set_output'
const endsAgentStep = false
const inputSchema = z
  .looseObject({
    data: z.record(z.string(), z.any()).optional(),
  })
  .describe(
    'JSON object to set as the agent output. The shape of the parameters are specified dynamically further down in the conversation. This completely replaces any previous output. If the agent was spawned, this value will be passed back to its parent. If the agent has an outputSchema defined, the output will be validated against it.',
  )
const description = `
Subagents must use this tool as it is the only way to report any findings. Nothing else you write will be visible to the user/parent agent.

Note that the output schema is provided dynamically in a user prompt further down in the conversation. Be sure to follow what the latest output schema is when using this tool.

Please set the output with all the information and analysis you want to pass on. If you just want to send a simple message, use an object with the key "message" and value of the message you want to send.
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    message: 'I found a bug in the code!',
  },
  endsAgentStep,
})}
`.trim()

export const setOutputParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        message: z.string(),
      }),
    }),
  ]),
} satisfies $ToolParams
