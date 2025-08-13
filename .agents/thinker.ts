import { publisher } from './constants'
import { thinker } from './factory/thinker'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker',
  publisher,

  ...thinker('openai/gpt-5'),
}

export default definition
