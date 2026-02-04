import { createCodeEditor } from './editor'

import type { AgentDefinition } from '../../agents/types/agent-definition'


const definition: AgentDefinition = {
  ...createCodeEditor({ model: 'gpt-5' }),
  reasoningOptions: {
    effort: 'high',
  },
  inheritParentSystemPrompt: false,
  id: 'reviewer-editor-gpt-5',
}
export default definition
