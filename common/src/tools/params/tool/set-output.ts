import z from 'zod/v4'

import { $getNativeToolCallExampleString } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'set_output'
const endsAgentStep = false

// WHY `data` EXISTS IN THE INPUT SCHEMA:
// Subagents inherit their parent's tool definitions, and because of prompt caching
// we cannot modify or add tools mid-conversation. OpenAI models enforce the tool's
// input schema strictly, so we need a permissive shape that any model can call.
// An empty schema or `z.object({}).passthrough()` would be rejected by OpenAI's
// strict schema enforcement. The `data: z.record(...)` field is a deliberately
// vague shape that satisfies OpenAI while allowing us to inject the real
// outputSchema later in the conversation (in the instructions prompt).
//
// At runtime, the handler (`packages/agent-runtime/src/tools/handlers/tool/set-output.ts`)
// tries parsing against the real outputSchema in two ways:
//   1. Parse the raw output (agent passed fields at top level)
//   2. Fallback: parse `output.data` (agent wrapped fields in `data`)
// This means both `{ results: [...] }` and `{ data: { results: [...] } }` are accepted.
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
