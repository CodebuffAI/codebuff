import { publisher } from '../constants.ts'
import { ask as askFactory } from './ask-factory.ts'

import type { SecretAgentDefinition } from '../types/secret-agent-definition.ts'

const definition: SecretAgentDefinition = {
  id: 'ask',
  publisher,
  ...askFactory('openai/gpt-5'),
}

export default definition
