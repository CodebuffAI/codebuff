import thinker from './thinker'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-codex',
  model: 'openai/gpt-5.3-codex',
  outputSchema: undefined,
  outputMode: 'last_message',
  instructionsPrompt: `You are the thinker-codex agent. Think deeply about the user request and when satisfied, write out your response.
  
The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,
  handleSteps: function* () {
    yield 'STEP_ALL'
  },
}

export default definition
