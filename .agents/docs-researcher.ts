import { publisher } from './constants'
import { docsResearcher } from './factory/docs-researcher'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'docs-researcher',
  publisher,
  ...docsResearcher('x-ai/grok-4-fast'),
}

export default definition
