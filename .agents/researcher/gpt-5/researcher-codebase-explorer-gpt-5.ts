import { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'
import researcherCodebaseExplorer from '../researcher-codebase-explorer'

const definition: SecretAgentDefinition = {
  ...researcherCodebaseExplorer,
  id: 'researcher-codebase-explorer-gpt-5',
  publisher,
  displayName: 'Codebase Explorer GPT-5',
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'medium',
  },
}

export default definition
