import { describe, expect, test } from 'bun:test'

import accessibilityReviewer from '../specialists/accessibility-reviewer'
import architect from '../specialists/architect'
import compatibilityReviewer from '../specialists/compatibility-reviewer'
import dependencyReviewer from '../specialists/dependency-reviewer'
import docsArchitect from '../specialists/docs-architect'
import evaluator from '../specialists/evaluator'
import incidentCoordinator from '../specialists/incident-coordinator'
import integrationAgent from '../specialists/integration-agent'
import migrationReviewer from '../specialists/migration-reviewer'
import performanceSpecialist from '../specialists/performance-specialist'
import productReviewer from '../specialists/product-reviewer'
import releaseManager from '../specialists/release-manager'
import reliabilityReviewer from '../specialists/reliability-reviewer'
import uxVisualReviewer from '../specialists/ux-visual-reviewer'

const specialists = [
  architect,
  productReviewer,
  integrationAgent,
  performanceSpecialist,
  reliabilityReviewer,
  migrationReviewer,
  accessibilityReviewer,
  uxVisualReviewer,
  compatibilityReviewer,
  dependencyReviewer,
  incidentCoordinator,
  releaseManager,
  docsArchitect,
  evaluator,
]

describe('specialist agents', () => {
  test('have unique routed ids and snapshot-aware read contracts', () => {
    expect(new Set(specialists.map((agent) => agent.id)).size).toBe(
      specialists.length,
    )
    for (const agent of specialists) {
      expect(agent.includeMessageHistory).toBe(false)
      expect(agent.spawnableAgents).toEqual([])
      expect(agent.toolNames).toContain('inspect_workspace')
      expect(agent.toolNames).toContain('get_task')
      expect(agent.toolNames).toContain('get_change_review_bundle')
      expect(agent.instructionsPrompt).toContain('snapshot_id')
      expect(agent.outputSchema).toBeDefined()
    }
  })

  test('grants role-scoped intelligence tools without mutation authority', () => {
    const byId = new Map(specialists.map((agent) => [agent.id, agent]))
    expect(byId.get('performance-specialist')?.toolNames).toContain(
      'inspect_environment',
    )
    expect(byId.get('dependency-reviewer')?.toolNames).toContain(
      'get_build_targets',
    )
    expect(byId.get('integration-agent')?.toolNames).toContain(
      'get_affected_tests',
    )
    expect(byId.get('release-manager')?.toolNames).toContain(
      'get_build_targets',
    )
    expect(byId.get('architect')?.toolNames).not.toContain(
      'inspect_environment',
    )
  })

  test('remain read-only even when diagnostic terminal access is enabled', () => {
    for (const agent of specialists) {
      expect(agent.toolNames).not.toContain('write_file')
      expect(agent.toolNames).not.toContain('str_replace')
      expect(agent.toolNames).not.toContain('run_targeted_validation')
    }
  })
})
