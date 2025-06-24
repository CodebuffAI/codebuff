import { models } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
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

const model = models.sonnet

export const claude4_gemini_thinking: AgentTemplate = {
  type: AgentTemplateTypes.claude4_gemini_thinking,
  description: 'Max agent using Claude Sonnet for highest quality responses',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [],
  initialAssistantMessage: getToolCallString('spawn_agents', {
    agents: JSON.stringify([
      {
        agent_type: AgentTemplateTypes.gemini25pro_thinking,
        prompt: '',
        include_message_history: true,
      },
    ]),
  }),
  initialAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
}
