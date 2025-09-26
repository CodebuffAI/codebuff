import { reviewer } from './reviewer-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...reviewer('openai/gpt-5'),
  id: 'reviewer-max',
  reasoningOptions: {
    enabled: true,
    effort: 'medium',
  },
}

export default definition
