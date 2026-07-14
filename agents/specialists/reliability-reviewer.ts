import { createSpecialist } from './create-specialist'
export default createSpecialist({
  id: 'reliability-reviewer',
  displayName: 'Reliability and Concurrency Reviewer',
  purpose:
    'Reviews races, retries, cancellation, idempotency, state machines, and resource cleanup.',
  focus: [
    'Race conditions and shared state',
    'Retries, idempotency, and partial failure',
    'Cancellation and resource ownership',
    'State-machine invariants and recovery',
  ],
})
