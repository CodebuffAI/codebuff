import { createSpecialist } from './create-specialist'
export default createSpecialist({
  id: 'dependency-reviewer',
  displayName: 'Dependency and Supply-Chain Reviewer',
  purpose:
    'Reviews dependency necessity, provenance, licenses, vulnerabilities, lockfiles, and packaging boundaries.',
  intelligence: ['environment', 'builds'],
  focus: [
    'Necessity and existing alternatives',
    'Provenance, vulnerability, and license risk',
    'Manifest and lockfile correctness',
    'Runtime versus development dependency boundaries',
  ],
})
