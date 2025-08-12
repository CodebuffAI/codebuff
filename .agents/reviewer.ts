import { reviewer } from './factory/reviewer'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'reviewer',
  publisher: 'codebuff',
  ...reviewer('openai/gpt-5'),
}

export default definition