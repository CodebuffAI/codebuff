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
import { createBase2 } from '../base2/base2'

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
      expect(agent.outputMode).toBe('structured_output')
      expect(agent.toolNames).toContain('set_output')
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

  test('are available while planning and executing durable plans', () => {
    for (const options of [{ planOnly: true }, { executePlan: true }]) {
      const spawnable = createBase2('default', options).spawnableAgents ?? []
      for (const agent of specialists) {
        expect(spawnable).toContain(agent.id)
      }
    }
  })

  test('use distinct advisory and post-edit reviewer contracts', () => {
    const advisoryInput = architect.inputSchema as any
    const advisoryOutput = architect.outputSchema as any
    expect(advisoryInput.params.required).not.toContain('snapshot_id')
    expect(advisoryOutput.required).not.toContain('verdict')
    expect(advisoryOutput.properties.family.enum).toEqual(['advisory'])

    const reviewerInput = dependencyReviewer.inputSchema as any
    const reviewerOutput = dependencyReviewer.outputSchema as any
    expect(reviewerInput.params.required).toContain('snapshot_id')
    expect(reviewerOutput.required).toContain('verdict')
    expect(reviewerOutput.required).toContain('coverage')
    expect(reviewerOutput.properties.family.enum).toEqual(['reviewer'])
    expect(reviewerOutput.properties.dimensions.required).toContain(
      'manifest_and_lockfile_correctness',
    )
    expect(reviewerOutput.properties.findings.items.required).toEqual([
      'id',
      'severity',
      'dimension',
      'summary',
      'evidence',
      'correction',
    ])
    expect(reviewerOutput.properties.findings.maxItems).toBe(20)
    expect(
      reviewerOutput.properties.findings.items.properties.evidence.maxItems,
    ).toBe(8)
    expect(
      reviewerOutput.properties.findings.items.properties.summary.maxLength,
    ).toBe(2_000)
    expect(reviewerOutput.properties.reviewedFiles.maxItems).toBe(200)
    expect(reviewerOutput.properties.requirementCoverage.maxItems).toBe(100)
    expect(dependencyReviewer.instructionsPrompt).toContain(
      'never JSON.stringify',
    )
  })
})
