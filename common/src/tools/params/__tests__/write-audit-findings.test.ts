import { describe, expect, it } from 'bun:test'

import { writeAuditFindingsParams } from '../tool/write-audit-findings'

const validInput = {
  sessionSlug: 'audit-openbuff-2026-07',
  shardId: 'runtime-1',
  snapshotId: 'snapshot-1',
  findings: [],
  coverage: {
    subsystemIds: ['agent-runtime'],
    featureIds: ['tool-dispatch'],
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
  noIssuesFound: true,
}

describe('write_audit_findings input', () => {
  it('accepts one safe derived-artifact identity', () => {
    const parsed = writeAuditFindingsParams.inputSchema.safeParse(validInput)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.coverage.domains).toContain('api-contract')
    }
  })

  it('keeps legacy calls without snapshotId valid', () => {
    const { snapshotId: _snapshotId, ...legacyInput } = validInput
    expect(
      writeAuditFindingsParams.inputSchema.safeParse(legacyInput).success,
    ).toBe(true)
  })

  it('keeps legacy calls without explicit domains valid', () => {
    const { domains: _domains, ...coverage } = validInput.coverage
    expect(
      writeAuditFindingsParams.inputSchema.safeParse({
        ...validInput,
        coverage,
      }).success,
    ).toBe(true)
  })

  it('normalizes the legacy api-abi finding domain', () => {
    const parsed = writeAuditFindingsParams.inputSchema.safeParse({
      ...validInput,
      findings: [
        {
          severity: 'LOW',
          domain: 'api-abi',
          path: 'src/index.ts',
          title: 'Compatibility note',
          risk: 'Contracts could drift.',
          fix: 'Keep the public contract aligned.',
          evidence: 'The exported shape is public.',
        },
      ],
      noIssuesFound: false,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.findings[0]?.domain).toBe('api-contract')
    }
  })

  it('rejects traversal and dot path segments', () => {
    for (const sessionSlug of ['../escape', '..', '.', 'nested/session']) {
      expect(
        writeAuditFindingsParams.inputSchema.safeParse({
          ...validInput,
          sessionSlug,
        }).success,
      ).toBe(false)
    }
  })

  it('requires noIssuesFound to agree with the findings array', () => {
    expect(
      writeAuditFindingsParams.inputSchema.safeParse({
        ...validInput,
        noIssuesFound: false,
      }).success,
    ).toBe(false)
  })
})
