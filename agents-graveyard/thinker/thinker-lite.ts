import thinker from './thinker'

import type { SecretAgentDefinition } from '../../agents/types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-lite',
  displayName: 'Thinker Lite',
  model: 'x-ai/grok-4-fast',
}

export default definition
