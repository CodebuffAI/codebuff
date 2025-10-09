import { publisher } from '../constants.ts'
import baseLite from './base-lite.ts'

import type { SecretAgentDefinition } from '../types/secret-agent-definition.ts'

const definition: SecretAgentDefinition = {
  ...baseLite,
  id: 'base-lite-codex',
  publisher,
  model: 'openai/gpt-5-codex',
  reasoningOptions: {
    enabled: true,
    effort: 'medium',
  },
}

export default definition
