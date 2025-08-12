import { thinker } from './factory/thinker'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker',
  publisher: 'codebuff',
  ...thinker('openai/gpt-5'),
}

export default definition