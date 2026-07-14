import { createSpecialist } from './create-specialist'
export default createSpecialist({
  id: 'release-manager',
  displayName: 'Release Manager',
  purpose:
    'Plans explicitly authorized versioning, changelog, tag, package, CI/CD, artifact verification, and rollback workflows.',
  advisory: true,
  terminal: true,
  intelligence: ['environment', 'tests', 'builds'],
  focus: [
    'Authorization and release target',
    'Version, changelog, tag, and package consistency',
    'CI/CD and artifact verification',
    'Rollback and post-release validation',
  ],
})
