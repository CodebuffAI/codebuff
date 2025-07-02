import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import {
  askAgentAgentStepPrompt,
  askAgentSystemPrompt,
  askAgentUserInputPrompt,
} from '../ask-prompts'
import { AgentTemplate, baseAgentStopSequences } from '../types'

export const ask = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Base ask-mode agent that orchestrates the full response.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'spawn_agents',
    'add_subgoal',
    'update_subgoal',
    'browser_logs',
    'code_search',
    'end_turn',
    'read_files',
    'think_deeply',
  ],
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [AgentTemplateTypes.gemini25flash_file_picker],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: askAgentSystemPrompt(model),
  userInputPrompt: askAgentUserInputPrompt(model),
  agentStepPrompt: askAgentAgentStepPrompt(model),
})
