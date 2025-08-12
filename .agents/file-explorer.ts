import { publisher, version } from './constants'

import type { AgentDefinition } from './types/agent-definition'

const config: AgentDefinition = {
  id: 'file-explorer',
  version,
  publisher,
  displayName: 'Dora the File Explorer',
  parentPrompt:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: [`file-picker`],
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

export default config
