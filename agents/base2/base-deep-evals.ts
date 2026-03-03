import { createBaseDeep } from './base-deep'

const definition = {
  ...createBaseDeep({ noAskUser: true, noLearning: true }),
  id: 'base-deep-evals',
  displayName: 'Buffy the Codex Evals Orchestrator',
}
export default definition
