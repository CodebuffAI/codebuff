import { createBase2 } from './base2'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const base2 = createBase2('fast')

const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-gpt-5',
  model: 'openai/gpt-5',
}

export default definition
