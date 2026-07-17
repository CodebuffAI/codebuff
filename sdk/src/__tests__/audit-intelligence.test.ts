import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  auditDomains,
  evaluateAuditCoverage,
  inspectCodebaseStructure,
  inspectFeatureCompleteness,
} from '../services/audit-intelligence'
import { inspectFeatureCompletenessTool } from '../tools/audit-intelligence'
import {
  auditCoverageDomains,
  evaluateAuditCoverageParams,
} from '../../../common/src/tools/params/tool/audit-intelligence'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-audit-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'cli', 'commands'), { recursive: true })
  fs.mkdirSync(path.join(root, 'sdk', 'src', '__tests__'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test' } }),
  )
  fs.writeFileSync(
    path.join(root, 'cli', 'commands', 'resume-plan.ts'),
    'export function resumePlan() { try { return "ready" } catch (error) { return error } }',
  )
  fs.writeFileSync(
    path.join(root, 'sdk', 'src', 'resume-plan.ts'),
    'export const resumePlan = () => "ready"',
  )
  fs.writeFileSync(
    path.join(root, 'sdk', 'src', '__tests__', 'resume-plan.test.ts'),
    'test("resume plan", () => {})',
  )
  fs.writeFileSync(
    path.join(root, 'README.md'),
    '# Resume plan\nUse the resume plan command.',
  )
  return root
}

describe('native audit intelligence', () => {
  test('creates a snapshot-bound structural and capability inventory', () => {
    const inventory = inspectCodebaseStructure(fixture())
    expect(inventory.snapshotId).toHaveLength(64)
    expect(inventory.subsystems.map((item) => item.id)).toContain('cli')
    expect(inventory.commands).toContain('cli/commands/resume-plan.ts')
    expect(inventory.capabilityPacket.languages).toContain('typescript')
  })

  test('keeps SDK and tool-schema audit domains aligned', () => {
    expect(auditDomains).toEqual(auditCoverageDomains)
  })

  test('returns a snapshot-bound feature coverage receipt', () => {
    const root = fixture()
    const inventory = inspectCodebaseStructure(root)
    const result = inspectFeatureCompletenessTool(root, {
      feature: 'resume plan',
      snapshot_id: inventory.snapshotId,
    })
    const value = result[0]?.type === 'json' ? result[0].value : undefined
    expect(value).toMatchObject({
      coverageReceipt: {
        schema_version: 1,
        snapshot_id: inventory.snapshotId,
        feature: 'resume plan',
        evidence_kind: 'heuristic',
      },
    })
  })

  test('evaluates vertical feature evidence and blocks uncovered structure', () => {
    const root = fixture()
    const inventory = inspectCodebaseStructure(root)
    const feature = inspectFeatureCompleteness(root, 'resume plan', inventory)
    expect(feature.evidence.implementation.length).toBeGreaterThan(0)
    const blocked = evaluateAuditCoverage({
      inventory,
      structuralReceipts: [
        {
          schemaVersion: 1,
          snapshotId: inventory.snapshotId,
          shardId: 'cli-shard',
          subsystemIds: ['cli'],
          files: ['cli/commands/resume-plan.ts'],
          domains: [...auditDomains],
        },
      ],
      featureRecords: [feature],
    })
    expect(blocked.complete).toBe(false)
    expect(blocked.uncoveredSubsystems).toContain('sdk')
    expect(blocked.incompleteFeatures).toHaveLength(1)
  })

  test('rejects string attestations and an empty feature inventory', () => {
    expect(
      evaluateAuditCoverageParams.inputSchema.safeParse({
        snapshot_id: 'x',
        structural_receipts: ['cli'],
        features: [],
      }).success,
    ).toBe(false)
    const inventory = inspectCodebaseStructure(fixture())
    const receipts = inventory.subsystems.map((subsystem) => ({
      schemaVersion: 1 as const,
      snapshotId: inventory.snapshotId,
      shardId: `${subsystem.id}-shard`,
      subsystemIds: [subsystem.id],
      files: [
        inventory.files.find(
          (file) =>
            (file.includes('/') ? file.split('/')[0] : '.') === subsystem.id,
        )!,
      ],
      domains: [...auditDomains],
    }))
    expect(
      evaluateAuditCoverage({
        inventory,
        structuralReceipts: receipts,
        featureRecords: [],
      }).complete,
    ).toBe(false)
  })

  test('normalizes composable audit receipts and keeps heuristic evidence incomplete', () => {
    const parsed = evaluateAuditCoverageParams.inputSchema.safeParse({
      snapshotId: 'snapshot-1',
      structuralReceipts: [
        {
          schemaVersion: 1,
          snapshotId: 'snapshot-1',
          shardId: 'server-shard',
          subsystemIds: ['server'],
          files: ['server/src/index.ts'],
          domains: ['correctness', 'api-abi'],
        },
      ],
      featureReceipts: [
        {
          schemaVersion: 1,
          snapshotId: 'snapshot-1',
          feature: 'review flow',
          evidenceKind: 'heuristic',
          evidence: {
            entrypoints: ['server/src/index.ts'],
            implementation: ['server/src/reviewer.ts'],
            consumers: ['server/src/index.ts'],
            tests: ['server/src/reviewer.test.ts'],
            docs: ['README.md'],
            failureStates: ['server/src/reviewer.ts'],
          },
        },
      ],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.structural_receipts[0]).toMatchObject({
      schema_version: 1,
      snapshot_id: 'snapshot-1',
      shard_id: 'server-shard',
      subsystem_ids: ['server'],
      domains: ['correctness', 'api-contract'],
    })
    expect(parsed.data.features[0]).toMatchObject({
      schema_version: 1,
      snapshot_id: 'snapshot-1',
      evidence_kind: 'heuristic',
      evidence: { failure_states: ['server/src/reviewer.ts'] },
    })
  })

  test('rejects receipts that do not carry their own snapshot identity', () => {
    const parsed = evaluateAuditCoverageParams.inputSchema.safeParse({
      snapshot_id: 'snapshot-1',
      structural_receipts: [
        {
          schema_version: 1,
          shard_id: 'server-shard',
          subsystem_ids: ['server'],
          files: ['server/src/index.ts'],
          domains: ['correctness'],
        },
      ],
      features: [
        {
          schema_version: 1,
          feature: 'review flow',
          evidence_kind: 'heuristic',
          evidence: {
            entrypoints: [],
            implementation: [],
            consumers: [],
            tests: [],
            docs: [],
            failure_states: [],
          },
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  test('requires snapshot-bound files, all domains, and verified feature evidence', () => {
    const inventory = inspectCodebaseStructure(fixture())
    const feature = inspectFeatureCompleteness(
      inventory.root,
      'resume plan',
      inventory,
    )
    const receipts = inventory.subsystems.map((subsystem) => ({
      schemaVersion: 1 as const,
      snapshotId: inventory.snapshotId,
      shardId: `${subsystem.id}-shard`,
      subsystemIds: [subsystem.id],
      files: [
        inventory.files.find(
          (file) =>
            (file.includes('/') ? file.split('/')[0] : '.') === subsystem.id,
        )!,
      ],
      domains: [...auditDomains],
    }))
    expect(
      evaluateAuditCoverage({
        inventory,
        structuralReceipts: receipts,
        featureRecords: [feature],
      }).complete,
    ).toBe(false)
    const verified = {
      ...feature,
      evidenceKind: 'verified' as const,
      status: 'complete' as const,
      missing: [],
      evidence: {
        entrypoints: ['cli/commands/resume-plan.ts'],
        implementation: ['sdk/src/resume-plan.ts'],
        consumers: ['cli/commands/resume-plan.ts'],
        tests: ['sdk/src/__tests__/resume-plan.test.ts'],
        docs: ['README.md'],
        failureStates: ['cli/commands/resume-plan.ts'],
      },
    }
    expect(
      evaluateAuditCoverage({
        inventory,
        structuralReceipts: receipts,
        featureRecords: [verified],
      }).complete,
    ).toBe(true)
    expect(
      evaluateAuditCoverage({
        inventory,
        structuralReceipts: [
          { ...receipts[0]!, snapshotId: 'stale' },
          ...receipts.slice(1),
        ],
        featureRecords: [verified],
      }).complete,
    ).toBe(false)
  })
})
