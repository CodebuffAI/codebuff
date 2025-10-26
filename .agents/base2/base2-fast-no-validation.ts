import { createBase2 } from './base2'

const definition = {
  ...createBase2('fast', { hasNoValidation: true }),
  id: 'base2-fast-no-validation',
  displayName: 'Buffy the Fast No Validation Orchestrator',
}
export default definition
