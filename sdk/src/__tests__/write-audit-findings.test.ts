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
})
