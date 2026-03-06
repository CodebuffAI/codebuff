import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-gpt',
  publisher,
  ...createReviewer('openai/gpt-5.4'),
}

export default definition