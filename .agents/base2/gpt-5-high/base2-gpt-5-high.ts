import { publisher } from '../../constants'
import { base2 } from '../base2-factory'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base2-gpt-5-high',
  publisher,
  ...base2('anthropic/claude-4-sonnet-20250522'),
  displayName: 'Base2 GPT-5 High',
  spawnableAgents: [
    'planner-gpt-5-high',
    'editor-gpt-5-high',
    'reviewer-gpt-5-high',
    'context-pruner',
  ],
}

export default definition
