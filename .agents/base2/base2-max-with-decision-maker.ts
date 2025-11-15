import { createBase2 } from './base2'

const definition = {
  ...createBase2('max', { withDecisionMaker: true }),
  id: 'base2-max-with-decision-maker',
  displayName: 'Buffy the Max Decision Maker Orchestrator',
}
export default definition
