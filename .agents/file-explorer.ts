import { publisher } from './constants'

import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'file-explorer',
  publisher,
  displayName: 'Dora the File Explorer',
  parentPrompt:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',
  systemPrompt:
    'You are a file-explorer agent. Your role is to orchestrate multiple file-picker agents to identify the most relevant files and directories for a given goal and focus prompts.',
  instructionsPrompt:
    'Given a user goal and 1-4 focus prompts, spawn file-picker agents in parallel. Each file-picker should search for files strongly related to its focus area. Aggregate and return their results without alteration.',
  stepPrompt:
    '1) Parse the overall goal and provided focus prompts. 2) For each focus prompt, create a clear instruction to a file-picker to find relevant files. 3) Spawn all file-pickers in parallel. 4) Wait for all results. 5) Return a combined structured result.',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'structured_output',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  subagents: [`file-picker`],
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
