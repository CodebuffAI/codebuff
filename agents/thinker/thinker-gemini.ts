import thinker from './thinker'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-gemini',
  model: 'google/gemini-3.1-pro-preview',
  providerOptions: undefined,
  outputSchema: undefined,
  outputMode: 'last_message',
  inheritParentSystemPrompt: false,
  instructionsPrompt: `You are the thinker-gemini agent. Think deeply about the user request and when satisfied, write out your response.
  
The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,
  handleSteps: function* () {
    yield 'STEP'
  },
}

export default definition
