import { createReviewer } from './code-reviewer'
import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-opus',
  publisher,
  ...createReviewer('anthropic/claude-opus-4.5'),
}

export default definition
