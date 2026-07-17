import { describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { getContentHash } from '@codebuff/common/util/content-hash'

import {
  auditFindingsArtifactPath,
  renderAuditFindingsMarkdown,
  writeAuditFindings,
} from '../tools/write-audit-findings'

const input = {
  sessionSlug: 'audit-openbuff-2026-07',
  shardId: 'runtime-1',
  snapshotId: 'snapshot-1',
  findings: [
    {
      severity: 'HIGH' as const,
      domain: 'correctness' as const,
      path: 'packages/agent-runtime/src/tools/tool-executor.ts',
      line: 688,
      title: 'Derived artifact path must remain scoped',
      risk: 'An arbitrary path would broaden shard mutation authority.',
      fix: 'Derive the path from validated session and shard identifiers.',
      evidence: 'The executor checks the same derived path as the SDK writer.',
    },
  ],
  coverage: {
    subsystemIds: ['agent-runtime'],
    featureIds: ['tool-dispatch'],
    files: ['packages/agent-runtime/src/tools/tool-executor.ts'],
    domains: [
      'security' as const,
      'correctness' as const,
      'state-mutation' as const,
      'error-handling' as const,
      'performance' as const,
      'dependency-hygiene' as const,
      'test-coverage' as const,
      'api-contract' as const,
    ],
  },
  noIssuesFound: false,
}

describe('writeAuditFindings', () => {
  test('derives and renders the findings artifact path', () => {
    expect(auditFindingsArtifactPath(input)).toBe(
      '.agents/sessions/audit-openbuff-2026-07/findings/runtime-1.md',
    )
    const markdown = renderAuditFindingsMarkdown(input)
    expect(markdown).toContain('# Audit findings: runtime-1')
    expect(markdown).toContain(
      '## [HIGH] correctness — packages/agent-runtime/src/tools/tool-executor.ts:688',
    )
    expect(markdown).toContain('### Files')
  })

  test('creates once and returns a compact receipt', async () => {
    const fs = createMockFs()
    const artifactPath = auditFindingsArtifactPath(input)
    const markdown = renderAuditFindingsMarkdown(input)

    const first = await writeAuditFindings({
      parameters: input,
      cwd: '/repo',
      fs,
    })
    const receipt = first[0]?.type === 'json' ? first[0].value : undefined
    expect(receipt).toEqual({
      artifactPath,
      artifacts: [artifactPath],
      findingCount: 1,
      severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
      coverage: { subsystemCount: 1, featureCount: 1, fileCount: 1 },
      structuralReceipt: {
        schema_version: 1,
        snapshot_id: 'snapshot-1',
        shard_id: 'runtime-1',
        subsystem_ids: ['agent-runtime'],
        files: ['packages/agent-runtime/src/tools/tool-executor.ts'],
        domains: [
          'security',
          'correctness',
          'state-mutation',
          'error-handling',
          'performance',
          'dependency-hygiene',
          'test-coverage',
          'api-contract',
        ],
      },
      contentHash: getContentHash(markdown),
    })
    expect(JSON.stringify(receipt)).not.toContain(input.findings[0].risk)
    expect(await fs.readFile(`/repo/${artifactPath}`, 'utf8')).toBe(markdown)

    const second = await writeAuditFindings({
      parameters: input,
      cwd: '/repo',
      fs,
    })
    const collision = second[0]?.type === 'json' ? second[0].value : undefined
    expect(collision).toMatchObject({ artifactPath })
    expect(collision).toHaveProperty('errorMessage')
    expect(await fs.readFile(`/repo/${artifactPath}`, 'utf8')).toBe(markdown)
  })

  test('preserves the legacy receipt shape when snapshotId is omitted', async () => {
    const fs = createMockFs()
    const { snapshotId: _snapshotId, ...legacyInput } = input
    const result = await writeAuditFindings({
      parameters: { ...legacyInput, shardId: 'runtime-legacy' },
      cwd: '/repo',
      fs,
    })
    const receipt = result[0]?.type === 'json' ? result[0].value : undefined

    expect(receipt).not.toHaveProperty('structuralReceipt')
  })

  test('does not attest to domain coverage when domains are omitted', async () => {
    const fs = createMockFs()
    const { domains: _domains, ...coverage } = input.coverage
    const result = await writeAuditFindings({
      parameters: {
        ...input,
        shardId: 'runtime-without-domains',
        coverage,
      },
      cwd: '/repo',
      fs,
    })
    const receipt = result[0]?.type === 'json' ? result[0].value : undefined

    expect(receipt).not.toHaveProperty('structuralReceipt')
  })
})
