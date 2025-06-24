import { Model } from '@codebuff/common/constants'
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

export const thinkingBase = (model: Model): Omit<AgentTemplate, 'type'> => ({
  description: 'Base agent that thinks before each response',
  model,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [AgentTemplateTypes.gemini25pro_thinking],
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
})
