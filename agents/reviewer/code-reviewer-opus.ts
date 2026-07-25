import { createReviewer } from './code-reviewer'
import { OPUS_MODEL, publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-opus',
  publisher,
  ...createReviewer(OPUS_MODEL),
  providerOptions: {
    only: ['amazon-bedrock'],
  },
}

export default definition
