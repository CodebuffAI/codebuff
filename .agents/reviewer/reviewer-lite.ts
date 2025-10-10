import { publisher } from '../constants'
import { createReviewer } from './reviewer'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'reviewer-lite',
  publisher,
  ...createReviewer('x-ai/grok-4-fast'),
}

export default definition
