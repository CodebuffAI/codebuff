import { base } from './base-factory.ts'
import { publisher } from '../constants.ts'

import type { SecretAgentDefinition } from '../types/secret-agent-definition.ts'

const definition: SecretAgentDefinition = {
  id: 'base-max',
  publisher,
  ...base('anthropic/claude-sonnet-4.5', 'max'),
  spawnableAgents: [
    'file-explorer',
    'find-all-referencer',
    'researcher-web-sonnet',
    'researcher-docs-sonnet',
    'decomposing-planner',
    'decomposing-thinker',
    'reviewer',
    'context-pruner',
  ],
}

export default definition
