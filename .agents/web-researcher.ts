import { publisher } from './constants'
import { webResearcher } from './factory/web-researcher'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'web-researcher',
  publisher,
  ...webResearcher('x-ai/grok-4-fast'),
}

export default definition
