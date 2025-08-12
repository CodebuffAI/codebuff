import { publisher, version } from './constants'
import { base } from './factory/base.ts'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base',
  version,
  publisher,
  ...base('anthropic/claude-sonnet-4'),
}

export default definition
