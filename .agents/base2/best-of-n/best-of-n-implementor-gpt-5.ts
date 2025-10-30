import { createBestOfNImplementor } from './best-of-n-implementor'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

export default {
  ...createBestOfNImplementor({ model: 'gpt-5' }),
  id: 'best-of-n-implementor-gpt-5',
} satisfies SecretAgentDefinition
