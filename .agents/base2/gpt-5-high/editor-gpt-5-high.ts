import editor from '../editor'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...editor,
  id: 'editor-gpt-5-high',
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'high',
    exclude: true,
  },
}

export default definition
