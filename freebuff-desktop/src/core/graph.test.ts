import { describe, expect, test } from 'bun:test'

import { isMergeable, isUnblocked, wouldCreateCycle } from './graph'
import type { DependencyEdge, TaskId, TaskStatus } from './types'

describe('isUnblocked (start gate: parent workflow done)', () => {
  const statuses: Record<TaskId, TaskStatus> = {
    merged: 'merged',
    review: 'awaiting-approval',
    running: 'running',
    ready: 'ready',
  }
  const statusOf = (id: TaskId) => statuses[id]

  test('no parents → unblocked', () => {
    expect(isUnblocked({ parents: [] }, statusOf)).toBe(true)
  })

  test('all parents merged → unblocked', () => {
    expect(isUnblocked({ parents: ['merged'] }, statusOf)).toBe(true)
  })

  test('parent awaiting-approval → unblocked (can start before merge)', () => {
    expect(isUnblocked({ parents: ['review'] }, statusOf)).toBe(true)
    expect(isUnblocked({ parents: ['review', 'merged'] }, statusOf)).toBe(true)
  })

  test('parent still running/ready → blocked (workflow not done yet)', () => {
    expect(isUnblocked({ parents: ['running'] }, statusOf)).toBe(false)
    expect(isUnblocked({ parents: ['review', 'running'] }, statusOf)).toBe(false)
    expect(isUnblocked({ parents: ['ready'] }, statusOf)).toBe(false)
  })

  test('unknown parent → blocked', () => {
    expect(isUnblocked({ parents: ['zzz'] }, statusOf)).toBe(false)
  })
})

describe('isMergeable (merge gate: all parents merged)', () => {
  const statuses: Record<TaskId, TaskStatus> = {
    merged: 'merged',
    review: 'awaiting-approval',
  }
  const statusOf = (id: TaskId) => statuses[id]

  test('no parents → mergeable', () => {
    expect(isMergeable({ parents: [] }, statusOf)).toBe(true)
  })

  test('all parents merged → mergeable', () => {
    expect(isMergeable({ parents: ['merged'] }, statusOf)).toBe(true)
  })

  test('parent only in review → NOT mergeable (must wait for parent merge)', () => {
    expect(isMergeable({ parents: ['review'] }, statusOf)).toBe(false)
    expect(isMergeable({ parents: ['merged', 'review'] }, statusOf)).toBe(false)
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
