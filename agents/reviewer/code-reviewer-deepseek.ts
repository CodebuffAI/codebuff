import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-deepseek',
  publisher,
  ...createReviewer('deepseek/deepseek-v4-pro'),
}

export default definition
