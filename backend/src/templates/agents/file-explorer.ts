import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'

import type { AgentTemplate } from '../types'

const paramsSchema = z.object({
  prompts: z
    .array(z.string())
    .describe(
      'List of 1-4 different parts of the codebase that could be useful to explore',
    ),
})

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
    prompt: z
      .string()
      .describe('What you need to accomplish by exploring the codebase'),
    params: paramsSchema,
  },
  systemPrompt:
    'You are a file explorer agent that spawns multiple file picker agents in parallel to comprehensively explore the codebase.',
  instructionsPrompt: '',
  stepPrompt: '',

  handleSteps: function* ({ prompt, params }) {
    const filePickerPrompts = params.prompts.map(
      (focusPrompt) =>
        `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`,
    )

    // Spawn all file pickers in parallel
    const { toolResult: spawnResult } = yield {
      toolName: 'spawn_agents' as const,
      args: {
        agents: filePickerPrompts.map((promptText) => ({
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
} satisfies AgentTemplate<string, z.infer<typeof paramsSchema>>
