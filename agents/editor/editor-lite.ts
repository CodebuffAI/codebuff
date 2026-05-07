import { createCodeEditor } from './editor'

import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  ...createCodeEditor({ model: 'kimi' }),
  id: 'editor-lite',
}
export default definition
