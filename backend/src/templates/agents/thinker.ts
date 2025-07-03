import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml, closeXmlTags } from '@codebuff/common/util/xml'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const thinker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: AGENT_PERSONAS['gemini25pro_thinker'].name,
  description: AGENT_PERSONAS['gemini25pro_thinker'].description,
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  stopSequences: closeXmlTags(['end_turn']),
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert programmer.
${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `
Think deeply, step by step, about the user request and how best to approach it.

Consider edge cases, potential issues, and alternative approaches.

Come up with a list of insights that would help someone arrive at the best solution.

Try not to be too prescriptive or confident in one solution. Instead, give clear arguments and reasoning.

You must be extremely concise and to the point. Write as few words as possible. Use short sentences, roughly 5 words each.
`.trim(),

  agentStepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,
})
