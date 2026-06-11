import { createReviewer } from './code-reviewer'
import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-fable',
  publisher,
  ...createReviewer('anthropic/claude-fable-5'),
  providerOptions: {
    only: ['amazon-bedrock'],
  },
}

export default definition
