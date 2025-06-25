import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { AgentTemplate, baseAgentStopSequences } from '../types'

export const planner = (model: Model): Omit<AgentTemplate, 'type'> => ({
  description: 'Agent that formulates a comprehensive plan to a prompt.',
  model,
  toolNames: [
    'read_files',
    'find_files',
    'code_search',
    'run_terminal_command',
    'think_deeply',
    'spawn_agents',
  ],
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [
    AgentTemplateTypes.gemini25pro_thinker,
    AgentTemplateTypes.gemini25flash_file_picker,
  ],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',

  systemPrompt: `Create a comprehensive plan to tackle the user request. Spawn a file picker agent to explore more files. Spawn a thinker agent to consider specific problems in depth.

Propose several cruxes that could vary the plan. From those cruxes, write out alternative plans, think about each one in parallel, and choose the best. Flesh out your chosen plan. Focus primarily on the implementation steps, with special attention to the key cruxes.`,
  userInputPrompt: '',
  agentStepPrompt: '',
})
