import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const paramsSchema = {
  type: 'object',
  properties: {
    prompts: {
      type: 'array',
      items: { type: 'string' },
      description:
        'List of 1-4 different parts of the codebase that could be useful to explore',
    },
  },
  required: ['prompts'],
}

export const fileExplorer = {
  id: AgentTemplateTypes.file_explorer,
  displayName: 'Dora the File Explorer',
  spawnerPrompt:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['file-picker'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What you need to accomplish by exploring the codebase',
    },
    params: paramsSchema,
  },
  systemPrompt:
    'You are a file explorer agent that spawns multiple file picker agents in parallel to comprehensively explore the codebase.',
  instructionsPrompt: '',
  stepPrompt: '',

  handleSteps: function* ({ prompt, params }) {
    if (!params?.prompts) {
      return
    }

    const filePickerPrompts = params.prompts.map(
      (focusPrompt: string) =>
        `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`,
    )

    // Spawn all file pickers in parallel
    const { toolResult: spawnResult } = yield {
      toolName: 'spawn_agents' as const,
      args: {
        agents: filePickerPrompts.map((promptText: string) => ({
          agent_type: 'file-picker' as const,
          prompt: promptText,
        })),
      },
    }

    // Set output with aggregated results
    yield {
      toolName: 'set_output' as const,
      args: {
        results: spawnResult,
      },
    }
  },
} satisfies SecretAgentDefinition
