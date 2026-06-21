import { describe, expect, test } from 'bun:test'

import {
  PipelineRunner,
  type PipelineExecutors,
  type ReviewOutcome,
  type StageExecutor,
  type StageOutcome,
} from './pipeline'
import { Store } from './store'

function okExecutor(outcome: StageOutcome = { kind: 'ok' }): StageExecutor & {
  calls: number
} {
  return {
    calls: 0,
    async run() {
      this.calls++
      return outcome
    },
  }
}

function harness(executors: PipelineExecutors, opts: { maxReviewRetries?: number } = {}) {
  const store = Store.memory()
  store.insertProject({
    id: 'p',
    repoUrl: 'r',
    rootPath: '/tmp',
    dailyBudget: 1000,
    concurrencyCap: 5,
    createdAt: 0,
  })
  const task = store.insertTask({
    id: 't1',
    projectId: 'p',
    title: 'T',
    description: 'spec',
    origin: 'human',
    status: 'ready',
    createdAt: 1,
  })
  let now = 0
  const events: string[] = []
  const runner = new PipelineRunner({
    store,
    executors,
    clock: () => ++now,
    maxReviewRetries: opts.maxReviewRetries,
    onEvent: (e) => events.push(`${e.type}:${'stage' in e ? e.stage : ''}`),
  })
  return { store, runner, task, events }
}

function passingReview() {
  return {
    reviewCalls: 0,
    fixCalls: 0,
    async run(): Promise<ReviewOutcome> {
      this.reviewCalls++
      return { kind: 'ok' }
    },
    async fix() {
      this.fixCalls++
    },
  }
}

describe('PipelineRunner happy path', () => {
  test('runs all stages and surfaces the task for approval', async () => {
    const executors: PipelineExecutors = {
      implement: okExecutor(),
      simplify: okExecutor(),
      review: passingReview(),
      test: okExecutor(),
      pr: okExecutor({ kind: 'ok', prUrl: 'https://github.com/acme/repo/pull/1' }),
    }
    const { store, runner } = harness(executors)
    const result = await runner.run('t1')

    expect(result).toEqual({ status: 'awaiting-approval' })
    const task = store.getTask('t1')!
    expect(task.status).toBe('awaiting-approval')
    expect(task.stage).toBeNull()
    expect(task.lastCompletedStage).toBe('pr')
    expect(task.prUrl).toBe('https://github.com/acme/repo/pull/1')
  })

  test('a skipped stage still advances the pipeline', async () => {
    const simplify = okExecutor({ kind: 'skipped' })
    const executors: PipelineExecutors = {
      implement: okExecutor(),
      simplify,
      review: passingReview(),
      test: okExecutor(),
      pr: okExecutor(),
    }
    const { runner, store } = harness(executors)
    await runner.run('t1')
    expect(simplify.calls).toBe(1)
    expect(store.getTask('t1')!.status).toBe('awaiting-approval')
  })
})

describe('PipelineRunner review loop', () => {
  test('fixes findings then passes, tracking retries', async () => {
    const review = {
      reviewCalls: 0,
      fixCalls: 0,
      async run(): Promise<ReviewOutcome> {
        this.reviewCalls++
        return this.reviewCalls === 1
          ? { kind: 'needs-fixes', findings: 'missing null check' }
          : { kind: 'ok' }
      },
      async fix() {
        this.fixCalls++
      },
    }
    const executors: PipelineExecutors = {
      implement: okExecutor(),
      simplify: okExecutor(),
      review,
      test: okExecutor(),
      pr: okExecutor(),
    }
    const { runner, store } = harness(executors)
    const result = await runner.run('t1')
    expect(result.status).toBe('awaiting-approval')
    expect(review.reviewCalls).toBe(2)
    expect(review.fixCalls).toBe(1)
    expect(store.getTask('t1')!.reviewRetries).toBe(1)
  })

  test('escalates to blocked after exhausting retries', async () => {
    const review = {
      async run(): Promise<ReviewOutcome> {
        return { kind: 'needs-fixes', findings: 'still broken' }
      },
      fixCalls: 0,
      async fix() {
        this.fixCalls++
      },
    }
    const executors: PipelineExecutors = {
      implement: okExecutor(),
      simplify: okExecutor(),
      review,
      test: okExecutor(),
      pr: okExecutor(),
    }
    const { runner, store } = harness(executors, { maxReviewRetries: 2 })
    const result = await runner.run('t1')
    expect(result.status).toBe('blocked')
    expect(review.fixCalls).toBe(2)
    const task = store.getTask('t1')!
    expect(task.status).toBe('blocked')
    expect(task.reviewRetries).toBe(2)
  })
})

describe('PipelineRunner halting + resume', () => {
  test('a blocked stage halts the pipeline and downstream stages do not run', async () => {
    const test = okExecutor()
    const pr = okExecutor()
    const executors: PipelineExecutors = {
      implement: okExecutor({ kind: 'blocked', reason: 'broken run-config' }),
      simplify: okExecutor(),
      review: passingReview(),
      test,
      pr,
    }
    const { runner, store } = harness(executors)
    const result = await runner.run('t1')
    expect(result).toEqual({ status: 'blocked', reason: 'broken run-config' })
    expect(store.getTask('t1')!.status).toBe('blocked')
    expect(test.calls).toBe(0)
    expect(pr.calls).toBe(0)
  })

  test('resume re-runs only stages after lastCompletedStage', async () => {
    const implement = okExecutor()
    const simplify = okExecutor()
    const review = passingReview()
    const test = okExecutor()
    const pr = okExecutor()
    const executors: PipelineExecutors = { implement, simplify, review, test, pr }
    const { runner, store } = harness(executors)
    // Simulate a pause after review completed.
    store.updateTask('t1', { lastCompletedStage: 'review' }, 1)

    await runner.run('t1')
    expect(implement.calls).toBe(0)
    expect(simplify.calls).toBe(0)
    expect(review.reviewCalls).toBe(0)
    expect(test.calls).toBe(1)
    expect(pr.calls).toBe(1)
    expect(store.getTask('t1')!.status).toBe('awaiting-approval')
  })
})
