import { type SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createCodeReviewerSelector } from './code-reviewer-selector'

export default {
  ...createCodeReviewerSelector({ model: 'gpt-5' }),
  id: 'code-reviewer-selector-gpt-5',
} satisfies SecretAgentDefinition
