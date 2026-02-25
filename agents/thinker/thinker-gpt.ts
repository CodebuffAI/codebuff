import thinker from './thinker'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-gpt',
  model: 'openai/gpt-5.3-codex',
  handleSteps: function* () {
    yield 'STEP_ALL'
  },
}

export default definition
