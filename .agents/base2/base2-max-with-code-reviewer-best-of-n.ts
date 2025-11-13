import { createBase2 } from './base2'

const definition = {
  ...createBase2('max', { hasCodeReviewerBestOfN: true }),
  id: 'base2-max-with-code-reviewer-best-of-n',
  displayName: 'Buffy the Code Reviewing Best-of-N Max Orchestrator',
}
export default definition
