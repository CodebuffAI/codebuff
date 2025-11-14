import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', { hasCodeReviewer: true }),
  id: 'base2-with-code-reviewer',
  displayName: 'Buffy the Code Reviewing Orchestrator',
}
export default definition
