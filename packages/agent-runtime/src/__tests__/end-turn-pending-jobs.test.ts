import { afterEach, describe, expect, test } from 'bun:test'

import {
  __clearPendingBackgroundJobsForTest,
  upsertPendingBackgroundJob,
} from '@codebuff/common/util/pending-background-jobs'

import {
  __clearBackgroundAgentJobsForTest,
  allocateBackgroundAgentJob,
} from '../util/background-agent-jobs'
import { handleEndTurn } from '../tools/handlers/tool/end-turn'

afterEach(() => {
  __clearPendingBackgroundJobsForTest()
  __clearBackgroundAgentJobsForTest()
})

const runHandler = async () => {
  const result = await handleEndTurn({
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolName: 'end_turn',
      toolCallId: 'test-end-turn',
      input: {},
    },
  } as Parameters<typeof handleEndTurn>[0])
  const [entry] = result.output as Array<{
    type: 'json'
    value: Record<string, unknown>
  }>
  return entry.value
}

describe('handleEndTurn', () => {
  test('returns the plain Turn ended message when no jobs are running', async () => {
    const value = await runHandler()
    expect(value).toEqual({ message: 'Turn ended.' })
  })

  test('surfaces running background jobs in the end_turn output', async () => {
    upsertPendingBackgroundJob({
      jobId: 'job-test-1',
      command: 'echo hi',
      status: 'running',
      startedAt: 1,
    })
    upsertPendingBackgroundJob({
      jobId: 'job-test-2',
      command: 'sleep 100',
      status: 'running',
      startedAt: 2,
    })

    const value = await runHandler()
    expect(value.message).toContain('2 shell job(s)')
    expect(value.pendingBackgroundJobs).toEqual([
      { jobId: 'job-test-1', command: 'echo hi', startedAt: 1 },
      { jobId: 'job-test-2', command: 'sleep 100', startedAt: 2 },
    ])
    expect(value.pendingBackgroundJobsTruncated).toBeUndefined()
  })

  test('surfaces running background agent jobs', async () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'researcher-web',
      agentName: 'Web researcher',
    })

    const value = await runHandler()
    expect(value.message).toContain('1 agent job(s)')
    expect(value.pendingBackgroundAgentJobs).toEqual([
      {
        jobId: job.jobId,
        agentType: 'researcher-web',
        agentName: 'Web researcher',
        startedAt: job.startedAt,
      },
    ])
  })

  test('truncates the listed jobs when more than five are running', async () => {
    for (let i = 0; i < 7; i++) {
      upsertPendingBackgroundJob({
        jobId: `job-${i}`,
        command: `cmd ${i}`,
        status: 'running',
        startedAt: i,
      })
    }

    const value = await runHandler()
    expect(value.pendingBackgroundJobs).toHaveLength(5)
    expect(value.pendingBackgroundJobsTruncated).toBe(2)
  })

  test('ignores completed/errored jobs that are still registered', async () => {
    upsertPendingBackgroundJob({
      jobId: 'job-running',
      command: 'echo running',
      status: 'running',
      startedAt: 1,
    })
    upsertPendingBackgroundJob({
      jobId: 'job-done',
      command: 'echo done',
      status: 'completed',
      startedAt: 2,
    })

    const value = await runHandler()
    expect(value.pendingBackgroundJobs).toEqual([
      { jobId: 'job-running', command: 'echo running', startedAt: 1 },
    ])
  })
})
