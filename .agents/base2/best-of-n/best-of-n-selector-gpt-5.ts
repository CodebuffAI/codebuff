import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import base2Selector from './best-of-n-selector'

const definition: SecretAgentDefinition = {
  ...base2Selector,
  id: 'best-of-n-selector-gpt-5',
  model: 'openai/gpt-5',
  displayName: 'Best-of-N GPT-5 Implementation Selector',
}

export default definition
