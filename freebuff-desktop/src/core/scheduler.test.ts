import { describe, expect, test } from 'bun:test'

import {
  ROLLING_WINDOW_MS,
  budgetRemaining,
  isBudgetExhausted,
  recordUsage,
  selectAdmittable,
  selectPromotable,
} from './scheduler'
import type { Task, TaskStatus } from './types'

let seq = 0
function task(partial: Partial<Task> & { id: string; status: TaskStatus }): Task {
  return {
    id: partial.id,
    projectId: 'p',
    createdAt: partial.createdAt ?? ++seq,
    title: partial.id,
    description: '',
    status: partial.status,
    parents: partial.parents ?? [],
    branch: null,
    worktreePath: null,
    prUrl: null,
    lastCompletedStage: null,
    stage: null,
    origin: 'human',
    rationale: null,
    reviewRetries: 0,
    changesRequestedRounds: 0,
    updatedAt: 0,
  }
}

describe('budget', () => {
  test('no ledger → full budget remaining', () => {
    expect(budgetRemaining(null, 1000, 0)).toBe(1000)
  })

  test('within window → daily minus used', () => {
    const ledger = { accountId: 'a', tokensUsed: 300, windowStart: 0 }
    expect(budgetRemaining(ledger, 1000, 1000)).toBe(700)
  })

  test('elapsed window → fully refreshed', () => {
    const ledger = { accountId: 'a', tokensUsed: 999, windowStart: 0 }
    expect(budgetRemaining(ledger, 1000, ROLLING_WINDOW_MS)).toBe(1000)
  })

  test('exhausted when used >= daily', () => {
    const ledger = { accountId: 'a', tokensUsed: 1000, windowStart: 0 }
    expect(isBudgetExhausted(ledger, 1000, 1)).toBe(true)
  })

  test('recordUsage accumulates inside window', () => {
    const l1 = recordUsage(null, 'a', 100, 0)
    expect(l1).toEqual({ accountId: 'a', tokensUsed: 100, windowStart: 0 })
    const l2 = recordUsage(l1, 'a', 50, 500)
    expect(l2.tokensUsed).toBe(150)
    expect(l2.windowStart).toBe(0)
  })

  test('recordUsage rolls the window after it elapses', () => {
    const l1 = { accountId: 'a', tokensUsed: 900, windowStart: 0 }
    const l2 = recordUsage(l1, 'a', 10, ROLLING_WINDOW_MS + 1)
    expect(l2.tokensUsed).toBe(10)
    expect(l2.windowStart).toBe(ROLLING_WINDOW_MS + 1)
  })
})

describe('selectAdmittable', () => {
  test('admits ready unblocked tasks FIFO up to free slots', () => {
    const tasks = [
      task({ id: 'r1', status: 'ready', createdAt: 1 }),
      task({ id: 'r2', status: 'ready', createdAt: 2 }),
      task({ id: 'r3', status: 'ready', createdAt: 3 }),
    ]
    const admitted = selectAdmittable({ tasks, concurrencyCap: 2, budgetExhausted: false })
    expect(admitted).toEqual(['r1', 'r2'])
  })

  test('counts running tasks against the cap', () => {
    const tasks = [
      task({ id: 'run1', status: 'running', createdAt: 1 }),
      task({ id: 'r2', status: 'ready', createdAt: 2 }),
      task({ id: 'r3', status: 'ready', createdAt: 3 }),
    ]
    const admitted = selectAdmittable({ tasks, concurrencyCap: 2, budgetExhausted: false })
    expect(admitted).toEqual(['r2'])
  })

  test('does not admit tasks with unmerged parents', () => {
    const tasks = [
      task({ id: 'parent', status: 'running', createdAt: 1 }),
      task({ id: 'child', status: 'ready', createdAt: 2, parents: ['parent'] }),
    ]
    const admitted = selectAdmittable({ tasks, concurrencyCap: 5, budgetExhausted: false })
    expect(admitted).toEqual([])
  })

  test('admits a child once its parent is merged', () => {
    const tasks = [
      task({ id: 'parent', status: 'merged', createdAt: 1 }),
      task({ id: 'child', status: 'ready', createdAt: 2, parents: ['parent'] }),
    ]
    const admitted = selectAdmittable({ tasks, concurrencyCap: 5, budgetExhausted: false })
    expect(admitted).toEqual(['child'])
  })

  test('budget exhaustion admits nothing new', () => {
    const tasks = [task({ id: 'r1', status: 'ready', createdAt: 1 })]
    expect(selectAdmittable({ tasks, concurrencyCap: 5, budgetExhausted: true })).toEqual([])
  })

  test('full concurrency admits nothing', () => {
    const tasks = [
      task({ id: 'run1', status: 'running', createdAt: 1 }),
      task({ id: 'run2', status: 'running', createdAt: 2 }),
      task({ id: 'r3', status: 'ready', createdAt: 3 }),
    ]
    expect(selectAdmittable({ tasks, concurrencyCap: 2, budgetExhausted: false })).toEqual([])
  })
})

describe('selectPromotable', () => {
  test('promotes only proposed tasks', () => {
    const tasks = [
      task({ id: 'p1', status: 'proposed', createdAt: 1 }),
      task({ id: 'r1', status: 'ready', createdAt: 2 }),
      task({ id: 'p2', status: 'proposed', createdAt: 3 }),
    ]
    expect(selectPromotable(tasks)).toEqual(['p1', 'p2'])
  })
})
