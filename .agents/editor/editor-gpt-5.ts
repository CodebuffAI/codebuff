import editor from './editor'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...editor,
  id: 'editor-gpt-5',
  model: 'openai/gpt-5',
}

export default definition
