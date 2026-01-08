import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createCodeReviewerBestOfN } from './code-reviewer-best-of-n'

export default {
  ...createCodeReviewerBestOfN('gpt-5'),
  id: 'code-reviewer-best-of-n-gpt-5',
} satisfies SecretAgentDefinition
