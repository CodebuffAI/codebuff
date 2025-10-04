import { publisher } from '../constants'
import { reviewer } from './reviewer-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'reviewer-lite',
  publisher,
  ...reviewer('x-ai/grok-4-fast'),
}

export default definition
