import { models } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { AgentTemplate, baseAgentToolNames } from '../types'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from './base-prompts'

const model = models.sonnet

export const gemini25pro_thinking: AgentTemplate = {
  type: AgentTemplateTypes.gemini25pro_thinking,
  description: 'Max agent using Claude Sonnet for highest quality responses',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: [
    '</thought>',
    '</think_deeply>',
    '<read_files>',
    '<write_files>',
    '<end_turn>',
  ],
  spawnableAgents: [],
  initialAssistantMessage: null,
  initialAssistantPrefix: null,

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
}
