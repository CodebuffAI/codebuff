import { publisher } from './constants'
import { base } from './factory/base'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-lite',
  publisher,
  ...base('openai/gpt-5'),
  reasoningOptions: {
    enabled: true,
    exclude: false,
    effort: 'high',
  },
}

export default definition
