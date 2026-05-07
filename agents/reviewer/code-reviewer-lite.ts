import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-lite',
  publisher,
  ...createReviewer('moonshotai/kimi-k2.6'),
}

export default definition
