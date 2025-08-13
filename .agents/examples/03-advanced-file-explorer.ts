import type { AgentDefinition, ToolCall } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'advanced-file-explorer',
  displayName: 'Dora the File Explorer',
  model: 'openai/gpt-5',

  spawnerPrompt:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',

  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: [`codebuff/file-picker@0.0.1`],

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
  outputMode: 'structured_output',
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
            agent_type: 'codebuff/file-picker@0.0.1',
            prompt: promptText,
          })),
        },
      } satisfies ToolCall
    yield {
      toolName: 'set_output',
      input: {
        results: spawnResult,
      },
    } satisfies ToolCall
  },
}

export default definition
