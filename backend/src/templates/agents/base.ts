import { Model } from '@codebuff/common/constants'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import {
  AgentTemplate,
  baseAgentSpawnableAgents,
  baseAgentStopSequences,
  baseAgentToolNames,
} from '../types'

export const base = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Base agent that orchestrates the full response.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: baseAgentSpawnableAgents,
  initialAssistantPrefix: '',
  stepAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
