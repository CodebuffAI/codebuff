import z from 'zod/v4'

import { jsonObjectSchema } from '../../../types/json'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const spawnAgentsOutputSchema = z
  .object({
    agentType: z.string(),
  })
  .and(jsonObjectSchema)
  .array()

const toolName = 'spawn_agents'
const endsAgentStep = true
const inputSchema = z
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
  )
const description = `
Use this tool to spawn agents to help you complete the user request. Each agent has specific requirements for prompt and params based on their tools schema.

The prompt field is a simple string, while params is a JSON object that gets validated against the agent's schema.

Each agent available is already defined as another tool, or, dynamically defined later in the conversation.

**IMPORTANT**: \`agent_type\` must be an actual agent name (e.g., \`commander\`, \`code-searcher\`, \`opus-agent\`), NOT a tool name like \`read_files\`, \`str_replace\`, \`code_search\`, etc. If you need to call a tool, use it directly as a tool call instead of wrapping it in spawn_agents.

You can call agents either as direct tool calls (e.g., \`example-agent\`) or use \`spawn_agents\`. Both formats work, but **prefer using spawn_agents** because it allows you to spawn multiple agents in parallel for better performance. Both use the same schema with nested \`prompt\` and \`params\` fields.

**IMPORTANT**: Many agents have REQUIRED fields in their params schema. Check the agent's schema before spawning - if params has required fields, you MUST include them in the params object. For example, code-searcher requires \`searchQueries\`, commander requires \`command\`.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    agents: [
      {
        agent_type: 'commander',
        prompt: 'Check if tests pass',
        params: {
          command: 'npm test',
        },
      },
      {
        agent_type: 'code-searcher',
        params: {
          searchQueries: [{ pattern: 'authenticate', flags: '-g *.ts' }],
        },
      },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const spawnAgentsParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(spawnAgentsOutputSchema),
} satisfies $ToolParams
