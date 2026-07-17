import { describe, expect, test } from 'bun:test'

import { isAgentSessionArtifactPath } from '../sensitive-paths'

describe('agent session artifact paths', () => {
  test('recognizes canonical plan and audit artifacts', () => {
    for (const path of [
      '.agents/sessions/readiness/SPEC.md',
      '.agents/sessions/readiness/PLAN.md',
      '.agents/sessions/readiness/STATUS.md',
      '.agents/sessions/readiness/LESSONS.md',
      '.agents/sessions/readiness/STATE.json',
      '.agents/sessions/readiness/AUDIT-REPORT.md',
      '.agents/sessions/readiness/findings/services.md',
    ]) {
      expect(isAgentSessionArtifactPath(path)).toBe(true)
    }
  })

  test('permits traversal directories but not unrelated .agents files', () => {
    expect(isAgentSessionArtifactPath('.agents/sessions')).toBe(true)
    expect(isAgentSessionArtifactPath('.agents/sessions/readiness')).toBe(true)
    expect(
      isAgentSessionArtifactPath('.agents/sessions/readiness/findings'),
    ).toBe(true)
    expect(isAgentSessionArtifactPath('.agents/mcp.json')).toBe(false)
    expect(isAgentSessionArtifactPath('.agents/agents/private.ts')).toBe(false)
    expect(
      isAgentSessionArtifactPath('.agents/sessions/readiness/secrets.txt'),
    ).toBe(false)
  })
})
