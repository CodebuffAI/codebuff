import { publisher } from './constants'
import { reviewer } from './factory/reviewer'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'reviewer',
  publisher,
  ...reviewer('openai/gpt-oss-120b:nitro'),
}

export default definition
