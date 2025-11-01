import { createBase2 } from './base2'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const base2 = createBase2('fast', { isGpt5: true })

const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-gpt-5',
}

export default definition
