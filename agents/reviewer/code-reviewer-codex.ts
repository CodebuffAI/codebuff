import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-codex',
  publisher,
  ...createReviewer('openai/gpt-5.3-codex'),
}

export default definition