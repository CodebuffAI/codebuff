import { publisher } from '../../constants'
import researcherDocs from '../researcher-docs'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...researcherDocs,
  id: 'researcher-docs-sonnet',
  publisher,
  displayName: 'Docs Researcher Sonnet',
  model: 'anthropic/claude-sonnet-4.5',
}

export default definition
