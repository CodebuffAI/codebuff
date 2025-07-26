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
  name: AGENT_PERSONAS['base_lite'].name,
  purpose: AGENT_PERSONAS['base_lite'].purpose,
  promptSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: baseAgentToolNames,
  spawnableAgents: allAvailableAgents
    ? (allAvailableAgents as any[])
    : baseAgentSpawnableAgents,

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),

  handleSteps: function* ({ agentState, prompt, params }) {
    while (true) {
      yield {
        toolName: 'spawn_agents',
        args: {
          agents: [
            {
              agent_type: 'thinker',
              prompt: 'Think deeply about the user request',
            },
          ],
        },
      }
      const { toolResult: thinkResult } = yield 'STEP'
      if (thinkResult?.toolName === 'end_turn') {
        break
      }
    }
  },
})
