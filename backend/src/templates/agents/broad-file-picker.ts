import { z } from 'zod/v4'
import {
  PLACEHOLDER,
  ProgrammaticAgentContext,
  ProgrammaticAgentFunction,
  ProgrammaticAgentTemplate,
} from '../types'

// Broad file picker handler that spawns multiple file pickers in parallel
const broadFilePickerHandler: ProgrammaticAgentFunction = function* (
  context: ProgrammaticAgentContext
) {
  const { prompt, params } = context
  const focusPrompts: string[] = params?.prompts || []

  const filePickerPrompts = [
    PLACEHOLDER.USER_INPUT_PROMPT,
    ...focusPrompts.map(
      (focusPrompt) =>
        `<context>${PLACEHOLDER.USER_INPUT_PROMPT}</context>\n\n${prompt}\n\nIn particular, focus on:\n${focusPrompt}`
    ),
  ]

  // Spawn all file pickers in parallel
  const spawnResult = yield {
    toolName: 'spawn_agents' as const,
    args: {
      agents: filePickerPrompts.map((prompt) => ({
        agent_type: 'file_picker',
        prompt,
      })),
    },
  }

  // Update report with aggregated results
  yield {
    toolName: 'update_report' as const,
    args: {
      json_update: {
        broad_file_picker_results: spawnResult.result,
      },
    },
  }
}

export const broadFilePicker: ProgrammaticAgentTemplate = {
  id: 'broad_file_picker',
  implementation: 'programmatic',
  name: 'Broad File Picker',
  purpose:
    'Spawns multiple file picker agents in parallel to comprehensively explore the codebase from different perspectives',
  handler: broadFilePickerHandler,
  includeMessageHistory: false,
  promptSchema: {
    prompt: z
      .string()
      .describe('Overall objective for what is trying to be accomplished'),
    params: z
      .object({
        prompts: z
          .array(z.string())
          .describe(
            'List of 1-4 different parts of the codebase that could be useful to explore'
          ),
      })
      .describe('Parameters for the broad file picker'),
  },
  toolNames: ['spawn_agents', 'update_report'] as const,
  spawnableAgents: ['file_picker'],
}
