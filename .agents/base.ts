import { publisher } from './constants'
import { base } from './factory/base.ts'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base',
  publisher,
  ...base('anthropic/claude-4.5-sonnet', 'normal'),
}

export default definition
