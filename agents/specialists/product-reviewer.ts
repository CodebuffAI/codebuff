import { createSpecialist } from './create-specialist'
export default createSpecialist({
  id: 'product-reviewer',
  displayName: 'Product and Spec Reviewer',
  purpose:
    'Reviews requirements, plans, and implemented behavior for user-facing completeness and acceptance-criteria quality.',
  intelligence: ['audit'],
  focus: [
    'Requirement completeness',
    'End-to-end feature reachability',
    'User-visible behavior and failure states',
    'Acceptance criteria and backward compatibility',
  ],
})
