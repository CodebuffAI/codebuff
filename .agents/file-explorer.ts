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
  handleSteps: function* ({ prompt, params }) {
    const filePickerPrompts = params.prompts.map(
        (focusPrompt) =>
          `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`,
      ),
      { toolResult: spawnResult } = yield {
        toolName: 'spawn_agents',
        args: {
          agents: filePickerPrompts.map((promptText) => ({
            agent_type: 'file_picker',
            prompt: promptText,
          })),
        },
      }
    yield {
      toolName: 'set_output',
      args: {
        results: spawnResult?.result,
      },
    }
  },
}

export default config
