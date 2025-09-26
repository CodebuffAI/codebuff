import { type SecretAgentDefinition } from '../../types/secret-agent-definition'
import { publisher } from '../../constants'
import researcher from '../researcher-grok-4-fast'

const definition: SecretAgentDefinition = {
  ...researcher,
  id: 'researcher-gpt-5',
  publisher,
  displayName: 'Researcher GPT-5',
  model: 'openai/gpt-5',
  reasoningOptions: {
    enabled: true,
    effort: 'medium',
  },

  spawnableAgents: [
    'file-explorer',
    'researcher-codebase-explorer-gpt-5',
    'researcher-web-gpt-5',
    'researcher-docs-gpt-5',
  ],
}

export default definition
