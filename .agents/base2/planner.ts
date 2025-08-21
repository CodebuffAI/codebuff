import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { plannerFactory } from './planner-factory'

const definition: SecretAgentDefinition = {
  id: 'planner',
  ...plannerFactory('google/gemini-2.5-pro', 'gemini-thinker-high'),
}

export default definition
