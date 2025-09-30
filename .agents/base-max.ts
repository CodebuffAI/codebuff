import { publisher } from './constants'
import { base } from './factory/base.ts'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-max',
  publisher,
  ...base('anthropic/claude-sonnet-4.5', 'max'),
  spawnableAgents: [
    'file-explorer',
    'researcher-web-sonnet',
    'researcher-docs-sonnet',
    'implementation-planner-max',
    'thinker',
    'reviewer-max',
    'context-pruner',
  ],
}

export default definition
