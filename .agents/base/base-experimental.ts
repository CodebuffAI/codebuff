import { publisher } from '../constants'
import { base } from './base-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-experimental',
  publisher,
  ...base('grok-4', 'experimental'),
}

export default definition
