import { describe, expect, test } from 'bun:test'

import { isUnblocked, wouldCreateCycle } from './graph'
import type { DependencyEdge, TaskId, TaskStatus } from './types'

describe('isUnblocked', () => {
  const statuses: Record<TaskId, TaskStatus> = {
    a: 'merged',
    b: 'running',
    c: 'merged',
  }
  const statusOf = (id: TaskId) => statuses[id]

  test('no parents → unblocked', () => {
    expect(isUnblocked({ parents: [] }, statusOf)).toBe(true)
  })

  test('all parents merged → unblocked', () => {
    expect(isUnblocked({ parents: ['a', 'c'] }, statusOf)).toBe(true)
  })

  test('any parent not merged → blocked', () => {
    expect(isUnblocked({ parents: ['a', 'b'] }, statusOf)).toBe(false)
  })

  test('unknown parent → blocked', () => {
    expect(isUnblocked({ parents: ['zzz'] }, statusOf)).toBe(false)
  })
})

describe('wouldCreateCycle', () => {
  // a → b → c  (c depends on b depends on a)
  const edges: DependencyEdge[] = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ]

  test('self-edge is a cycle', () => {
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true)
  })

  test('back-edge closing the chain is a cycle', () => {
    // adding c → a would close a → b → c → a
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true)
  })

  test('forward/independent edge is fine', () => {
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false)
    expect(wouldCreateCycle(edges, 'c', 'd')).toBe(false)
  })
})
