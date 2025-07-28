import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import z from 'zod/v4'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import { AgentTemplate, baseAgentSubagents, baseAgentToolNames } from '../types'

export const thinkingBase = (
  model: Model,
  allAvailableAgents?: string[]
): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS['base_lite'].displayName,
  parentPrompt: AGENT_PERSONAS['base_lite'].purpose,
  promptSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: baseAgentToolNames,
  subagents: allAvailableAgents
    ? (allAvailableAgents as any[])
    : baseAgentSubagents,

  systemPrompt: baseAgentSystemPrompt(model),
  instructionsPrompt: baseAgentUserInputPrompt(model),
  stepPrompt: baseAgentAgentStepPrompt(model),

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
