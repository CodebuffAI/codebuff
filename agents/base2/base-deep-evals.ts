import { createBaseDeep } from './base-deep'

const definition = {
  ...createBaseDeep({ noAskUser: true }),
  id: 'base-deep-evals',
  displayName: 'Buffy the Codex Evals Orchestrator',
}
export default definition
