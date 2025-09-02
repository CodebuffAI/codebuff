import editor from 'base2/editor'
import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const editorLite: SecretAgentDefinition = {
  ...editor,
  id: 'editor-lite',
  displayName: 'Code Editor',
  publisher,
  model: 'x-ai/grok-code-fast-1',
}

export default editorLite
