import { publisher } from './constants'
import { researcher as researcherFactory } from './factory/researcher'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher',
  publisher,
  ...researcherFactory('claude-3-5-sonnet-20241022'),
}

export default definition