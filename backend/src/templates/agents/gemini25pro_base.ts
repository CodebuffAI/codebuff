import { geminiModels } from '@codebuff/common/constants'
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

const model = geminiModels.gemini2_5_pro_preview

export const gemini25pro_base: AgentTemplate = {
  type: AgentTemplateTypes.gemini25pro_base,
  description:
    'Experimental agent using Gemini 2.5 Pro Preview with advanced reasoning',
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
