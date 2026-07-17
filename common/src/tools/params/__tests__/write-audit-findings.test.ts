import { describe, expect, it } from 'bun:test'

import { writeAuditFindingsParams } from '../tool/write-audit-findings'

const validInput = {
  sessionSlug: 'audit-openbuff-2026-07',
  shardId: 'runtime-1',
  findings: [],
  coverage: {
    subsystemIds: ['agent-runtime'],
    featureIds: ['tool-dispatch'],
    files: ['packages/agent-runtime/src/tools/tool-executor.ts'],
  },
  noIssuesFound: true,
}

describe('write_audit_findings input', () => {
  it('accepts one safe derived-artifact identity', () => {
    expect(
      writeAuditFindingsParams.inputSchema.safeParse(validInput).success,
    ).toBe(true)
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
