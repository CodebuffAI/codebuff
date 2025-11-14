import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createBestOfNSelector } from './best-of-n-selector'

const definition: SecretAgentDefinition = {
  ...createBestOfNSelector({ model: 'gpt-5' }),
  id: 'best-of-n-selector-gpt-5',
  displayName: 'Best-of-N GPT-5 Implementation Selector',
}

export default definition
