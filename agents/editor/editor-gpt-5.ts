import { createCodeEditor } from './editor'
import type { AgentDefinition } from 'types/agent-definition'

const definition: AgentDefinition = {
  ...createCodeEditor({ model: 'gpt-5' }),
  id: 'editor-gpt-5',
}
export default definition
