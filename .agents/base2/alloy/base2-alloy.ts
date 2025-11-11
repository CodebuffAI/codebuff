import { createBase2 } from '../base2'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const base2 = createBase2('default')
const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-alloy',
  spawnableAgents: [
    ...(base2.spawnableAgents ?? []),
    'base2-gpt-5-single-step',
  ],
  handleSteps: function* ({ params }) {
    while (true) {
      // Run context-pruner before each step
      yield {
        toolName: 'spawn_agent_inline',
        input: {
          agent_type: 'context-pruner',
          params: params ?? {},
        },
        includeToolCall: false,
      } as any

      const { stepsComplete } = yield 'STEP'
      if (stepsComplete) break

      yield {
        toolName: 'spawn_agent_inline',
        input: {
          agent_type: 'base2-gpt-5-single-step',
        },
      }
    }
  },
}

export default definition
