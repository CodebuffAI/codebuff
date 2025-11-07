import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const paramsSchema = {
  type: 'object' as const,
  properties: {
    prompts: {
      type: 'array' as const,
      items: { type: 'string' },
      description:
        'List of 1-4 different parts of the codebase that could be useful to explore',
    },
  },
  required: ['prompts'],
}

const fileExplorer: SecretAgentDefinition = {
  id: AgentTemplateTypes.file_explorer,
  displayName: 'Dora the File Explorer',
  spawnerPrompt:
    'Comprehensively explores the codebase and reports back on the results',
  model: 'x-ai/grok-4-fast',
  publisher,
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
    const prompts: string[] = params?.prompts ?? []
    const filePickerPrompts = prompts.map(
        (focusPrompt) =>
          `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`,
      ),
      { toolResult: spawnResult } = yield {
        toolName: 'spawn_agents',
        input: {
          agents: filePickerPrompts.map((promptText) => ({
            agent_type: 'file-picker',
            prompt: promptText,
          })),
        },
      }
    yield {
      toolName: 'set_output',
      input: {
        results: spawnResult,
      },
      includeToolCall: false,
    }
  },
}

export default fileExplorer
