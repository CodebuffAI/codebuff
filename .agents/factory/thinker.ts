import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/constants'
export const thinker = (model: Model): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.thinker.displayName,
  spawnerPrompt: AGENT_PERSONAS.thinker.purpose,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The problem you are trying to solve',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  spawnableAgents: [],

  systemPrompt: `You are an expert programmer and deep thinker.`,

  instructionsPrompt: `
Think deeply, step by step, about the user request and how best to approach it.

Consider edge cases, potential issues, and alternative approaches.

Come up with a list of insights that would help someone arrive at the best solution.

Try not to be too prescriptive or confident in one solution. Instead, give clear arguments and reasoning.

You must be extremely concise and to the point.
`.trim(),

  stepPrompt: `Don't forget to end your response with the end_turn tool.`,
})
