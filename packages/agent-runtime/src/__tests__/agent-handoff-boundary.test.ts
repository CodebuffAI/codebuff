import { describe, expect, test } from 'bun:test'

import { validateVersionedAgentHandoff } from '../tools/handlers/tool/spawn-agent-utils'

describe('versioned shipped-agent handoff boundary', () => {
  test('rejects repair-editor without a complete v1 handoff', () => {
    expect(() =>
      validateVersionedAgentHandoff({ agentType: 'repair-editor', handoff: {} }),
    ).toThrow(/requires a versioned handoff/)
  })

  test('accepts repair-editor with task, findings, and permissions', () => {
    expect(() =>
      validateVersionedAgentHandoff({
        agentType: 'repair-editor',
        handoff: {
          schemaVersion: 1,
          taskId: 'T1',
          objective: 'Fix finding',
          findings: [{ id: 'RF-1' }],
          permissions: { readablePaths: [], writablePaths: [], allowedTools: [] },
        },
      }),
    ).not.toThrow()
  })

  test('keeps custom and legacy agents compatible', () => {
    expect(() =>
      validateVersionedAgentHandoff({ agentType: 'custom-agent', handoff: undefined }),
    ).not.toThrow()
  })
})
