import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', { hasCodeReviewerBestOfN: true }),
  id: 'base2-with-code-reviewer-best-of-n',
  displayName: 'Buffy the Code Reviewing Best-of-N Orchestrator',
}
export default definition
