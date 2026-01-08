import { type SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createCodeReviewerImplementor } from './code-reviewer-implementor'

export default {
  ...createCodeReviewerImplementor({ model: 'gpt-5' }),
  id: 'code-reviewer-implementor-gpt-5',
} satisfies SecretAgentDefinition
