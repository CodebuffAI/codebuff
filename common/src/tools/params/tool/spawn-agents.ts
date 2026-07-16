import z from 'zod/v4'

import { MAX_SPAWN_BATCH_SIZE } from '../../../constants/agents'
import { agentHandoffSchema } from '../../../types/agent-handoff'

import { jsonObjectSchema } from '../../../types/json'
import {
  $getNativeToolCallExampleString,
  coerceToObject,
  jsonToolResultSchema,
  normalizeSpawnAgentList,
} from '../utils'

import type { $ToolParams } from '../../constants'

export const spawnAgentsOutputSchema = z
  .object({
    agentType: z.string(),
  })
  .and(jsonObjectSchema)
  .array()

export { agentHandoffSchema }

export type { AgentHandoff } from '../../../types/agent-handoff'

const legacyUnversionedHandoffSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => value.schemaVersion === undefined, {
    message:
      'Versioned handoffs must satisfy the complete canonical AgentHandoff schema.',
  })
const spawnHandoffSchema = z.union([
  agentHandoffSchema,
  legacyUnversionedHandoffSchema,
])

const toolName = 'spawn_agents'
const endsAgentStep = true
const inputSchema = z
  .object({
    agents: z.preprocess(
      normalizeSpawnAgentList,
      z
        .object({
          agent_type: z.string().describe('Agent to spawn'),
          prompt: z.string().optional().describe('Prompt to send to the agent'),
          background: z
            .boolean()
            .optional()
            .describe(
              'If true, launch the agent detached from this turn. spawn_agents returns immediately with a jobId; the agent runs as an in-process coroutine. Poll its progress with check_background_agent. Use for long-running, non-blocking work (e.g. indexing, eval runs, multi-step research) where you do not need the result before ending your turn. The background agent shares the same process so it cannot outlive this CLI session. Defaults to false (blocking).',
            ),
          handoff: spawnHandoffSchema
            .optional()
            .describe(
              'Optional structured handoff payload. Purely additive — children that do not consume `handoff` continue to receive `prompt` and `params` as before.',
            ),
          timeout_seconds: z
            .number()
            .optional()
            .describe(
              'Optional per-spawn wall-clock deadline in seconds. Omit it or set -1 for no timeout. Positive deadlines are opt-in and should be used only when the caller deliberately wants to stop a long-running child. A configured agent template defaultTimeoutMs still applies when present.',
            ),
          params: z
            .preprocess(
              coerceToObject,
              z
                .object({
                  // Common agent fields (all optional hints — each agent validates its own required fields)
                  command: z
                    .string()
                    .optional()
                    .describe('Terminal command to run (basher, tmux-cli)'),
                  what_to_summarize: z
                    .string()
                    .optional()
                    .describe(
                      'What information from the command output is desired (basher)',
                    ),
                  timeout_seconds: z
                    .number()
                    .optional()
                    .describe(
                      'Timeout for command. Set to -1 for no timeout. Default 30 (basher)',
                    ),
                  save_full_log: z
                    .boolean()
                    .optional()
                    .describe(
                      'Save full command output to a /tmp log and extract failure lines for long SYNC command output (basher)',
                    ),
                  failure_pattern: z
                    .string()
                    .optional()
                    .describe(
                      'grep -E failure extraction pattern used with save_full_log (basher)',
                    ),
                  max_failure_lines: z
                    .number()
                    .optional()
                    .describe(
                      'Maximum extracted failure lines to return with save_full_log (basher)',
                    ),
                  searchQueries: z
                    .array(
                      z.object({
                        pattern: z
                          .string()
                          .describe('The pattern to search for'),
                        flags: z
                          .union([z.string(), z.array(z.string())])
                          .optional()
                          .describe(
                            'Optional ripgrep flags as one string or argv tokens (e.g. "-i -g *.ts" or ["-i", "-g", "*.ts"]). Do not quote the entire expression inside the JSON string.',
                          ),
                        cwd: z
                          .string()
                          .optional()
                          .describe(
                            'Optional working directory relative to project root',
                          ),
                        maxResults: z
                          .number()
                          .optional()
                          .describe('Max results per file. Default 15'),
                      }),
                    )
                    .optional()
                    .describe('Array of code search queries (code-searcher)'),
                  filePaths: z
                    .array(z.string())
                    .optional()
                    .describe('Relevant file paths to read (general-agent)'),
                  directories: z
                    .array(z.string())
                    .optional()
                    .describe('Directories to search within (file-picker)'),
                  url: z
                    .string()
                    .optional()
                    .describe('Starting URL to navigate to (browser-use)'),
                  prompts: z
                    .array(z.string())
                    .optional()
                    .describe('Optional agent-specific prompts'),
                })
                .catchall(z.any()),
            )
            .optional()
            .describe('Parameters object for the agent'),
        })
        .array()
        .min(1)
        .max(
          MAX_SPAWN_BATCH_SIZE,
          `A spawn batch can contain at most ${MAX_SPAWN_BATCH_SIZE} agents. Split larger work into bounded waves.`,
        ),
    ),
  })
  .describe(
    `Spawn up to ${MAX_SPAWN_BATCH_SIZE} agents and send a prompt and/or parameters to each of them. These agents will run in parallel. Note that that means they will run independently. Split larger work into bounded waves. If you need to run agents sequentially, use spawn_agents with one agent at a time instead.`,
  )
const description = `
Use this tool to spawn agents to help you complete the user request. Each agent has specific requirements for prompt and params based on their tools schema.

The prompt field is a simple string, while params is a JSON object that gets validated against the agent's schema. Pass \`agents\` as an actual array of objects; do not JSON.stringify the array or its entries. The runtime repairs bounded complete JSON encodings, but malformed or truncated strings still fail closed.

Each agent available is already defined as another tool, or, dynamically defined later in the conversation.

**IMPORTANT**: \`agent_type\` must be an actual agent name (e.g., \`basher\`, \`code-searcher\`, \`general-agent\`), NOT a tool name like \`read_files\`, \`str_replace\`, \`code_search\`, etc. If you need to call a tool, use it directly as a tool call instead of wrapping it in spawn_agents.

You can call agents either as direct tool calls (using the listed tool name, e.g. \`example_agent\`) or use \`spawn_agents\` with the canonical agent name in \`agent_type\` (e.g. \`example-agent\`). Both formats work, but **prefer using spawn_agents** because it allows you to spawn multiple agents in parallel for better performance. Both use the same schema with nested \`prompt\` and \`params\` fields.

**IMPORTANT**: Many agents have REQUIRED fields in their params schema. Check the agent's schema before spawning - if params has required fields, you MUST include them in the params object. For example, code-searcher requires \`searchQueries\`, basher requires \`command\`.

Agent-specific fields belong inside \`params\`. For Basher, use \`{ "agent_type": "basher", "params": { "command": "bun test" } }\`; do not send an empty params object and do not put a shell command only in the prompt.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    agents: [
      {
        agent_type: 'basher',
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
