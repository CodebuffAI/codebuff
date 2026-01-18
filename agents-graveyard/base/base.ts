import { base } from './base-factory.ts'
import { publisher } from '../constants.ts'

import type { SecretAgentDefinition } from '../types/secret-agent-definition.ts'

const definition: SecretAgentDefinition = {
  id: 'base',
  publisher,
  ...base('anthropic/claude-sonnet-4.5', 'normal'),
}

export default definition
