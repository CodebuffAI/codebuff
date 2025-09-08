import { publisher } from './constants'
import { base } from './factory/base'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-lite',
  publisher,
  ...base('openai/gpt-5-chat', 'lite'),
  spawnableAgents: [
    'file-explorer',
    'file-picker',
    'web-researcher',
    'docs-researcher',
    'context-pruner',
  ],
}

export default definition
