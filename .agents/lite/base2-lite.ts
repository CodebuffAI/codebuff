import { publisher } from '../constants'
import { base2 } from 'base2/base2-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base2-lite',
  publisher,
  ...base2('anthropic/claude-4-sonnet-20250522'),
  spawnableAgents: ['scout', 'editor-lite', 'reviewer-lite', 'context-pruner'],
}

export default definition
