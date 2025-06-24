import { claudeModels } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import {
  AgentTemplate,
  baseAgentStopSequences,
  baseAgentToolNames,
} from '../types'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from './base-prompts'

const model = claudeModels.sonnet

export const claude4_base: AgentTemplate = {
  type: AgentTemplateTypes.claude4_base,
  description: 'Base agent using Claude Sonnet 4',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [],
  initialAssistantMessage: null,
  initialAssistantPrefix: null,

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
}
