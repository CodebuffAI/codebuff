import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'
import { AgentTemplate, baseAgentStopSequences } from '../types'

export const planner = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Agent that formulates a comprehensive plan to a prompt.',
  promptSchema: {
    prompt: true,
    params: z.object({
      filePaths: z
        .array(z.string())
        .optional()
        .describe(
          'Optional list of relevant file paths to consider in the planning'
        ),
    }),
  },
  includeMessageHistory: false,
  toolNames: [
    'read_files',
    'find_files',
    'code_search',
    'run_terminal_command',
    'think_deeply',
    'spawn_agents',
    'update_report',
    'end_turn',
  ],
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [
    AgentTemplateTypes.gemini25pro_thinker,
    AgentTemplateTypes.gemini25flash_file_picker,
  ],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `Create a comprehensive plan to tackle the user request using update_report. Spawn a file picker agent to explore more files. Spawn a thinker agent to consider specific problems in depth.

Propose several cruxes that could vary the plan. From those cruxes, write out alternative plans, think about each one in parallel, and choose the best. Flesh out your chosen plan. Focus primarily on the implementation steps, with special attention to the key cruxes.

Use end_turn to end your response.`,
  userInputPrompt: '',
  agentStepPrompt: '',
})
