import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { plannerFactory } from './planner-factory'

const definition: SecretAgentDefinition = {
  id: 'planner',
  ...plannerFactory('openai/gpt-5-chat'),
}

export default definition
