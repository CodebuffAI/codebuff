import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'
import { AgentTemplate, baseAgentStopSequences, PLACEHOLDER } from '../types'

export const planner = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Agent that formulates a comprehensive plan to a prompt.',
  promptSchema: {
    prompt: true,
    params: z.object({
      filePaths: z
        .array(z.string())
        .optional()
        .describe('List of relevant file paths to consider in the planning'),
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

  systemPrompt: `You are an expert software architect. You are good at creating comprehensive plans to tackle the user request.
Steps for your response:
1. Read the files provided in the filePaths array.
2. (Optional) Spawn a file picker agent to explore more files.
3. (Recommended) Spawn a thinker agent to consider specific problems in depth.
4. Propose several cruxes that could vary the plan. From those cruxes, write out alternative plans.
6. (Recommended) Spawn thinker agents to consider each plan in depth.
7. Use the update_report tool to write out one chosen plan with fleshed out details. Focus primarily on the implementation steps, with special attention to the key design cruxes. Make it easy for a junior developer to implement the plan.
8. Use the end_turn tool to end your response.

${PLACEHOLDER.TOOLS_PROMPT}`,
  userInputPrompt:
    'Use the update_report tool to write out your final plan when you are ready. Only what is included in the update_report tool call will be sent to the user.',
  agentStepPrompt: '',
})
