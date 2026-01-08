import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', { planOnly: true }),
  id: 'base2-plan',
  displayName: 'Buffy the Plan-Only Orchestrator',
}
export default definition
