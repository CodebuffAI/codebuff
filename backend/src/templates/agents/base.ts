import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
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
  description: 'Base agent that orchestrates the full response.',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: baseAgentSpawnableAgents,
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
