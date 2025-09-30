import { reviewer } from './reviewer-factory'
import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...reviewer('anthropic/claude-sonnet-4.5'),
  id: 'reviewer-max',
  publisher,
}

export default definition
