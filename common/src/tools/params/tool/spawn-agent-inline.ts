import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  coerceToObject,
  jsonToolResultSchema,
} from '../utils'
import { agentHandoffSchema } from './spawn-agents'
import { jsonValueSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

const toolName = 'spawn_agent_inline'
const endsAgentStep = true
const inputSchema = z
  .object({
    agent_type: z.string().describe('Agent to spawn'),
    prompt: z.string().optional().describe('Prompt to send to the agent'),
    handoff: agentHandoffSchema
      .optional()
      .describe(
        'Optional structured handoff payload. Purely additive — children that do not consume `handoff` continue to receive `prompt` and `params` as before.',
      ),
    params: z
      .preprocess(coerceToObject, z.record(z.string(), z.any()))
      .optional()
      .describe('Parameters object for the agent (if any)'),
  })
  .describe(
    `Spawn a single agent with a snapshot of the current message history.`,
  )
const description = `
Spawn a single agent with a snapshot of the current message history.
The spawned agent sees all previous messages, but its private intermediate
messages are isolated when control returns. Its final output is returned as
this tool's result. The context-pruner is the only exception: its compacted
message history replaces the parent history.

You should prefer to use the spawn_agents tool unless instructed otherwise. This tool is only for special cases.

This is useful for:
- Delegating specific tasks while maintaining context
- Having specialized agents process information inline
- Managing message history (e.g., summarization)
The agent will run until it calls end_turn, then control returns to you with its final output.
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    agent_type: 'file-picker',
    prompt: 'Find files related to authentication',
    params: { paths: ['src/auth.ts', 'src/user.ts'] },
  },
  endsAgentStep,
})}
`.trim()

export const spawnAgentInlineParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(jsonValueSchema),
} satisfies $ToolParams
