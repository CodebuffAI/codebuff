import commander from './commander'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  ...commander,
  id: 'commander-lite',
  displayName: 'Commander Lite',
  model: 'x-ai/grok-4.1-fast',
}

export default definition
