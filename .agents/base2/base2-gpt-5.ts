import { buildArray } from '@codebuff/common/util/array'
import { createBase2 } from './base2'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const base = createBase2('fast')

const definition: SecretAgentDefinition = {
  ...base,
  id: 'base2-gpt-5',
  model: 'openai/gpt-5',
  spawnableAgents: buildArray(
    'file-picker',
    'find-all-referencer',
    'researcher-web',
    'researcher-docs',
    'commander',
    'reviewer-gpt-5',
    'context-pruner',
  ),
}

export default definition
