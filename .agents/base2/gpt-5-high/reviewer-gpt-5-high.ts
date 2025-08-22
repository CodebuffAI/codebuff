import { reviewer } from '../../factory/reviewer'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...reviewer('openai/gpt-5'),
  id: 'reviewer-gpt-5-high',
  reasoningOptions: {
    effort: 'high',
    exclude: true,
  },
}

export default definition
