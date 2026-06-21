import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', { executePlan: true }),
  id: 'base2-execute-plan',
  displayName: 'Buffy the Plan Execution Orchestrator',
}
export default definition
