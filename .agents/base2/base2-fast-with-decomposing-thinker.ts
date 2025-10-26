import { createBase2 } from './base2'

const definition = {
  ...createBase2('fast', {
    hasNoValidation: true,
    hasDecomposingThinker: true,
  }),
  id: 'base2-fast-with-decomposing-thinker',
  displayName: 'Buffy the Fast With Decomposing Thinker Orchestrator',
}
export default definition
