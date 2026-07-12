import { describe, expect, test } from 'bun:test'

import { findMatchingSpawnAgent } from '../spawn-agent-matcher'

describe('findMatchingSpawnAgent', () => {
  test('uses tool-call correlation for concurrent same-type agents', () => {
    const pending = new Map([
      ['call-7-0', { index: 0, agentType: 'researcher' }],
      ['call-7-1', { index: 1, agentType: 'researcher' }],
    ])

    expect(findMatchingSpawnAgent(pending, 'researcher', 'call-7', 1)).toEqual({
      tempId: 'call-7-1',
      info: { index: 1, agentType: 'researcher' },
    })
  })

  test('does not guess when a legacy event has ambiguous same-type matches', () => {
    const pending = new Map([
      ['call-7-0', { index: 0, agentType: 'researcher' }],
      ['call-7-1', { index: 1, agentType: 'researcher' }],
    ])

    expect(findMatchingSpawnAgent(pending, 'researcher')).toBeNull()
  })

  test('retains unique type fallback for legacy events', () => {
    const pending = new Map([
      ['call-7-0', { index: 0, agentType: 'editor@1.0.0' }],
      ['call-7-1', { index: 1, agentType: 'researcher' }],
    ])

    expect(findMatchingSpawnAgent(pending, 'editor')).toMatchObject({
      tempId: 'call-7-0',
    })
  })
})
