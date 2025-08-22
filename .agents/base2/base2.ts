import { publisher } from '../constants'
import { base2 } from './base2-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base2',
  publisher,
  ...base2('anthropic/claude-4-sonnet-20250522'),
}

export default definition
