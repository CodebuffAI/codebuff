import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'file-explorer',
  displayName: 'Dora the File Explorer',
  parentPrompt:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'json',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  subagents: ['file-picker'],
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
  systemPrompt:
    'You are a file explorer agent that spawns multiple file picker agents in parallel to comprehensively explore the codebase.',
  instructionsPrompt: '',
  stepPrompt: '',
}

export default config
