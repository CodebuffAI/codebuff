import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import z from 'zod/v4'

import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import { baseAgentSubagents, baseAgentToolNames } from '../types'

import type { AgentTemplate } from '../types'
import type { Model } from '@codebuff/common/constants'

export const thinkingBase = (
  model: Model,
  allAvailableAgents?: string[],
): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.base_lite.displayName,
  spawnerPrompt: AGENT_PERSONAS.base_lite.purpose,
  inputSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: baseAgentToolNames,
  spawnableAgents: allAvailableAgents
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
      yield 'STEP'
    }
  },
})
