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
  baseAgentSpawnableAgents,
  baseAgentStopSequences,
  baseAgentToolNames,
} from '../types'

export const thinkingBase = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Base agent that thinks before each response',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: baseAgentToolNames,
  stopSequences: baseAgentStopSequences,
  spawnableAgents: baseAgentSpawnableAgents,
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: getToolCallString('spawn_agents', {
    agents: JSON.stringify([
      {
        agent_type: AgentTemplateTypes.gemini25pro_thinker,
        prompt: '',
        include_message_history: true,
      },
    ]),
  }),
  stepAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
