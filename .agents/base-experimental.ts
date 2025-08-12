import { publisher, version } from './constants'
import { base } from './factory/base'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-experimental',
  version,
  publisher,
  ...base('grok-4'),
}

export default definition
