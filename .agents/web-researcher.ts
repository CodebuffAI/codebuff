import { publisher } from './constants'
import { webResearcher } from './factory/web-researcher'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'web-researcher',
  publisher,
  ...webResearcher('google/gemini-2.5-flash'),
}

export default definition
