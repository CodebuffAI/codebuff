import type { AgentDefinition } from './types/agent-definition'
import commander from './commander'

const definition: AgentDefinition = {
  ...commander,
  id: 'commander-lite',
  displayName: 'Commander Lite',
  model: 'x-ai/grok-4.1-fast',
}

export default definition
