import { publisher, version } from './constants'

// Add base factory import
import { base } from './factory/base'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-lite',
  version,
  publisher,
  ...base('openai/gpt-5'),
}

export default definition
