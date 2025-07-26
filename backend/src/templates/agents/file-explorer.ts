import { z } from 'zod/v4'
import { AgentTemplate } from '../types'

const paramsSchema = z.object({
  prompts: z
    .array(z.string())
    .describe(
      'List of 1-4 different parts of the codebase that could be useful to explore'
    ),
})

export const fileExplorer = {
  id: 'file_explorer',
  displayName: 'Dora the File Explorer',
  purpose:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',
  model: 'anthropic/claude-4-sonnet-20250522',
  outputMode: 'json',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['file_picker'],
  promptSchema: {
    prompt: z
      .string()
      .describe('What you need to accomplish by exploring the codebase'),
    params: paramsSchema,
  },
  systemPrompt:
    'You are a file explorer agent that spawns multiple file picker agents in parallel to comprehensively explore the codebase.',
  userInputPrompt: '',
  agentStepPrompt: '',

  handleSteps: function* ({ prompt, params }) {
    const filePickerPrompts = params.prompts.map(
      (focusPrompt) =>
        `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`
    )

    // Spawn all file pickers in parallel
    const { toolResult: spawnResult } = yield {
      toolName: 'spawn_agents' as const,
      args: {
        agents: filePickerPrompts.map((promptText) => ({
          agent_type: 'file_picker' as const,
          prompt: promptText,
        })),
      },
    }

    // Set output with aggregated results
    yield {
      toolName: 'set_output' as const,
      args: {
        results: spawnResult?.result,
      },
    }
  },
} satisfies AgentTemplate<string, z.infer<typeof paramsSchema>>
