import { createReviewer } from './code-reviewer'
import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-gemini',
  publisher,
  ...createReviewer('google/gemini-3-pro-preview'),
}

export default definition
