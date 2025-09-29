import { reviewer } from './reviewer-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...reviewer('anthropic/claude-4.5-sonnet'),
  id: 'reviewer-max',
}

export default definition
