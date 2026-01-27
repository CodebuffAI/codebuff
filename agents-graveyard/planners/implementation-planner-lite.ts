import implementationPlanner from './implementation-planner'
import { type SecretAgentDefinition } from '../../agents/types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...implementationPlanner,
  id: 'implementation-planner-lite',
  displayName: 'Implementation Planner Lite',
  model: 'x-ai/grok-4-fast',
}

export default definition
