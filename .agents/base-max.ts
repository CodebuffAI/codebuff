import { publisher, version } from './constants'
import { base } from './factory/base.ts'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-max',
  version,
  publisher,
  ...base('anthropic/claude-opus-4.1'),
}

export default definition
