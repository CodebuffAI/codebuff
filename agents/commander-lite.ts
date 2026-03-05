import commander from './commander'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  ...commander,
  id: 'commander-lite',
  displayName: 'Commander Lite',
  model: 'google/gemini-3.1-flash-lite-preview',
}

export default definition
