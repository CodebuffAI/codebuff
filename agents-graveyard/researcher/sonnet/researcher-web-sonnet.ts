import { publisher } from '../../constants'
import researcherWeb from '../researcher-web'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...researcherWeb,
  id: 'researcher-web-sonnet',
  publisher,
  displayName: 'Web Researcher Sonnet',
  model: 'anthropic/claude-sonnet-4.5',
}

export default definition
