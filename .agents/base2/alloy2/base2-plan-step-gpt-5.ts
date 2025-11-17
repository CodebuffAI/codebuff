import planStep from './base2-plan-step'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...planStep,
  id: 'base2-plan-step-gpt-5',
  model: 'openai/gpt-5.1',
}

export default definition
