import { publisher } from '../constants'
import { reviewer } from './reviewer-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'reviewer',
  publisher,
  ...reviewer('anthropic/claude-sonnet-4.5'),
}

export default definition
