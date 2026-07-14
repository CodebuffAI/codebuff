import { createSpecialist } from './create-specialist'
export default createSpecialist({
  id: 'architect',
  displayName: 'Architecture Specialist',
  purpose:
    'Produces source-backed architecture decisions, boundaries, interfaces, migration paths, and decision records.',
  advisory: true,
  focus: [
    'Boundaries and dependency direction',
    'Public contracts and downstream consumers',
    'Migration and rollback strategy',
    'Alternatives, risks, and decision rationale',
  ],
})
