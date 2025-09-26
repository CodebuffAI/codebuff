import { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'
import researcherWeb from '../researcher-web'

const definition: SecretAgentDefinition = {
  ...researcherWeb,
  id: 'researcher-web-gpt-5',
  publisher,
  displayName: 'Web Researcher GPT-5',
  model: 'openai/gpt-5',
  reasoningOptions: {
    effort: 'medium',
  },
}

export default definition
