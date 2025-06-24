import { geminiModels } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import {
  AgentTemplate,
  baseAgentStopSequences,
  baseAgentToolNames,
} from '../types'

const model = geminiModels.gemini2_5_flash

export const gemini25flash_base: AgentTemplate = {
  type: AgentTemplateTypes.gemini25flash_base,
  description:
    'Lite agent using Gemini 2.5 Flash for fast and efficient responses',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
}
