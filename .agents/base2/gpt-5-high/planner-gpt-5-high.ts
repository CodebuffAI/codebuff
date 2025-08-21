import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { plannerFactory } from '../planner-factory'

const definition: SecretAgentDefinition = {
  id: 'planner-gpt-5-high',
  ...plannerFactory('openai/gpt-5', 'thinker-gpt-5-high'),
}

export default definition
