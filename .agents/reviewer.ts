import { publisher } from './constants'
import { reviewer } from './factory/reviewer'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'reviewer',
  publisher,
  ...reviewer('qwen/qwen3-235b-a22b-thinking-2507:nitro'),
}

export default definition
