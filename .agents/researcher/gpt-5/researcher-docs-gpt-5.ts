import { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'
import researcherDocs from '../researcher-docs'

const definition: SecretAgentDefinition = {
  ...researcherDocs,
  id: 'researcher-docs-gpt-5',
  publisher,
  displayName: 'Docs Researcher GPT-5',
  model: 'openai/gpt-5',
  reasoningOptions: {
    effort: 'medium',
  },
}

export default definition
