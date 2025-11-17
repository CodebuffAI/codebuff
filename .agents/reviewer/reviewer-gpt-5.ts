import reviewer from './reviewer'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...reviewer,
  id: 'reviewer-gpt-5',
  model: 'openai/gpt-5.1',
}

export default definition
