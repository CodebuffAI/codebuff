import { publisher } from './constants'
import { ask as askFactory } from './factory/ask.ts'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'ask',
  publisher,
  ...askFactory('openai/gpt-5'),
}

export default definition
