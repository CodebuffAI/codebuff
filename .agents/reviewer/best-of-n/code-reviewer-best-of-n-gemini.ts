import { createCodeReviewerBestOfN } from './code-reviewer-best-of-n'
import { publisher } from '../../constants'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-best-of-n-gemini',
  publisher,
  ...createCodeReviewerBestOfN('gemini'),
}

export default definition
