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
  instructionsPrompt: `You are the thinker-gemini agent. Think about the user request and when satisfied, write out a very concise response that captures the most important points. DO NOT be verbose -- say the absolute minimum needed to answer the user's question correctly.
  
The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,
  handleSteps: function* () {
    yield 'STEP'
  },
}

export default definition
