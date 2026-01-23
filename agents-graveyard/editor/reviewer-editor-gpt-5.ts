import { AgentDefinition } from 'types/agent-definition'
import { createCodeEditor } from './editor'

const definition: AgentDefinition = {
  ...createCodeEditor({ model: 'gpt-5' }),
  reasoningOptions: {
    effort: 'high',
  },
  inheritParentSystemPrompt: false,
  id: 'reviewer-editor-gpt-5',
}
export default definition
