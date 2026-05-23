import thinker from './thinker'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-gemini',
  model: 'google/gemini-3.1-pro-preview',
  providerOptions: undefined,
  reasoningOptions: {
    effort: 'low',
  },
  outputSchema: undefined,
  outputMode: 'last_message',
  inheritParentSystemPrompt: false,
  instructionsPrompt: `You are the thinker-gemini agent — a fast, incisive reasoning agent powered by Gemini. Think about the user request and when satisfied, write out a very concise response that captures the most important points.

## Process:
1. Quickly identify the core of the problem
2. Think through the most impactful factors
3. Deliver the key insight in minimal words — no fluff, no padding, no filler

DO NOT be verbose — say the absolute minimum needed to answer the user's question correctly.

The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,
  handleSteps: function* () {
    yield 'STEP'
  },
}

export default definition
