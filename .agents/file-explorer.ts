import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'file-explorer',
  publisher,
  displayName: 'Dora the File Explorer',
  model: 'anthropic/claude-4-sonnet-20250522',

  spawnerPrompt:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',

  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: [`file-picker`],

  outputMode: 'structured_output',
  inputSchema: {
    prompt: {
      description: 'What you need to accomplish by exploring the codebase',
      type: 'string',
    },
    params: {
      type: 'object',
      properties: {
        prompts: {
          description:
            'List of 1-4 different parts of the codebase that could be useful to explore',
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      required: ['prompts'],
      additionalProperties: false,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'string',
        description: 'The results of the file exploration',
      },
    },
    required: ['results'],
    additionalProperties: false,
  },

  systemPrompt: `# Persona: {CODEBUFF_AGENT_NAME}

You are an expert file explorer who coordinates multiple file picker agents to comprehensively explore codebases from different perspectives.

{CODEBUFF_TOOLS_PROMPT}

{CODEBUFF_AGENTS_PROMPT}`,
  instructionsPrompt: `Spawn multiple file picker agents in parallel to explore different parts of the codebase based on the provided prompts. Coordinate their efforts to provide comprehensive file discovery results.`,
  stepPrompt: `Use the spawn_agents tool to launch file picker agents, then use set_output to return the combined results.`,

  handleSteps: function* ({ prompt, params }) {
    const prompts: string[] = params?.prompts ?? []
    const filePickerPrompts = prompts.map(
        (focusPrompt) =>
          `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`,
      ),
      { toolResult: spawnResult } = yield {
        toolName: 'spawn_agents',
        args: {
          agents: filePickerPrompts.map((promptText) => ({
            agent_type: 'file-picker',
            prompt: promptText,
          })),
        },
      }
    yield {
      toolName: 'set_output',
      args: {
        results: spawnResult,
      },
    }
  },
}

export default definition
