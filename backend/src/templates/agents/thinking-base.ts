import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod/v4'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import {
  AgentTemplate,
  baseAgentSpawnableAgents,
  baseAgentToolNames,
} from '../types'

export const thinkingBase = (
  model: Model,
  allAvailableAgents?: string[]
): Omit<AgentTemplate, 'id'> => ({
  model,
  implementation: 'llm',
  name: AGENT_PERSONAS['base_lite'].name,
  description: AGENT_PERSONAS['base_lite'].description,
  promptSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: baseAgentToolNames,
  spawnableAgents: allAvailableAgents
    ? (allAvailableAgents as any[])
    : baseAgentSpawnableAgents,
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: getToolCallString(
    'spawn_agents',
    {
      agents: JSON.stringify([
        {
          agent_type: AgentTemplateTypes.thinker,
          prompt: '',
          include_message_history: true,
        },
      ]),
    },
    true
  ),
  stepAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
