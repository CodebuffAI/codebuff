import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml } from '@codebuff/common/util/xml'
import z from 'zod/v4'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const thinker = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS['thinker'].displayName,
  purpose: AGENT_PERSONAS['thinker'].purpose,
  promptSchema: {
    prompt: z.string().describe('The problem you are trying to solve'),
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  spawnableAgents: [],

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert programmer.

${PLACEHOLDER.TOOLS_PROMPT}

${PLACEHOLDER.AGENTS_PROMPT}`,

  instructionsPrompt: `
Think deeply, step by step, about the user request and how best to approach it.

Consider edge cases, potential issues, and alternative approaches.

Come up with a list of insights that would help someone arrive at the best solution.

Try not to be too prescriptive or confident in one solution. Instead, give clear arguments and reasoning.

You must be extremely concise and to the point.
`.trim(),

  stepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,
})
