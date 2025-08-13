import { publisher } from './constants'
import { researcher as researcherFactory } from './factory/researcher'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher',
  publisher,
  ...researcherFactory('google/gemini-2.5-pro'),
}

export default definition
