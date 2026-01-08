import { type SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createCodeReviewerSelector } from './code-reviewer-selector'

export default {
  ...createCodeReviewerSelector({ model: 'gemini' }),
  id: 'code-reviewer-selector-gemini',
} satisfies SecretAgentDefinition
