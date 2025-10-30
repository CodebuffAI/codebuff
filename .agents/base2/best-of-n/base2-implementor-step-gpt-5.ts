import type { SecretAgentDefinition } from '../../types/secret-agent-definition'
import { createBase2ImplementorStep } from './base2-implementor-step'

export default {
  ...createBase2ImplementorStep({ model: 'gpt-5' }),
  id: 'base2-implementor-step-gpt-5',
} satisfies SecretAgentDefinition
