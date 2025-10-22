import { buildArray } from '@codebuff/common/util/array'
import { createBase2 } from './base2'

const definition = {
  ...createBase2('max'),
  id: 'base2-max-simple',
  displayName: 'Buffy the Max Orchestrator',
  spawnableAgents: buildArray(
    'file-picker-max',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
    'base2-gpt-5-worker-simple',
    'context-pruner',
  ),
}
export default definition
