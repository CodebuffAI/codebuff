import { type SecretAgentDefinition } from '../types/secret-agent-definition'
import implementationPlanner from './implementation-planner'

const definition: SecretAgentDefinition = {
  ...implementationPlanner,
  id: 'implementation-planner-lite',
  displayName: 'Implementation Planner Lite',
  model: 'x-ai/grok-4-fast',
}

export default definition
