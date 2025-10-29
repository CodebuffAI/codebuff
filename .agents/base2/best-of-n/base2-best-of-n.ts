import { createBase2 } from '../base2'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const base2 = createBase2('fast', { bestOfN: true })
const definition: SecretAgentDefinition = {
  ...base2,
  id: 'base2-best-of-n',
  displayName: 'Buffy Best-of-N Orchestrator',
}

export default definition
