import { describe, test, expect, beforeEach } from 'bun:test'

import {
  allocateBackgroundAgentJob,
  attachBackgroundAgentPromise,
  registerBackgroundAgentJob,
  appendBackgroundAgentChunk,
  getBackgroundAgentJob,
  readNewBackgroundAgentChunks,
  readBackgroundAgentChunks,
  backgroundAgentJobOwnedBy,
  takeDroppedBackgroundAgentChunkCount,
  cancelBackgroundAgentJob,
  __clearBackgroundAgentJobsForTest,
} from '../util/background-agent-jobs'

describe('background-agent-jobs registry', () => {
  beforeEach(() => {
    __clearBackgroundAgentJobsForTest()
  })

  test('allocateBackgroundAgentJob creates a running job with a unique id', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    expect(job.jobId).toMatch(/^bg-agent-/)
    expect(job.status).toBe('running')
    expect(job.agentType).toBe('basher')
    expect(job.agentName).toBe('Basher')
    expect(job.chunks).toEqual([])
    expect(job.readOffset).toBe(0)
  })

  test('allocateBackgroundAgentJob produces distinct ids across calls', () => {
    const a = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    const b = allocateBackgroundAgentJob({
      agentType: 'code-searcher',
      agentName: 'Code Searcher',
    })
    expect(a.jobId).not.toBe(b.jobId)
  })

  test('getBackgroundAgentJob returns the job for a known id', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    expect(getBackgroundAgentJob(job.jobId)).toBe(job)
  })

  test('getBackgroundAgentJob returns undefined for unknown id', () => {
    expect(getBackgroundAgentJob('bg-agent-does-not-exist')).toBeUndefined()
  })

  test('attachBackgroundAgentPromise transitions to completed on resolve', async () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    attachBackgroundAgentPromise(job, Promise.resolve({ output: 'done' }))
    // Microtasks run on await.
    await Promise.resolve()
    await Promise.resolve()
    expect(job.status).toBe('completed')
    expect(job.result).toEqual({ output: 'done' })
  })

  test('attachBackgroundAgentPromise transitions to error on reject', async () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    attachBackgroundAgentPromise(job, Promise.reject(new Error('boom')))
    await Promise.resolve()
    await Promise.resolve()
    expect(job.status).toBe('error')
    expect(job.error).toBe('boom')
  })

  test('attachBackgroundAgentPromise normalizes non-Error rejections', async () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    attachBackgroundAgentPromise(job, Promise.reject('string reason'))
    await Promise.resolve()
    await Promise.resolve()
    expect(job.status).toBe('error')
    expect(job.error).toBe('string reason')
  })

  test('registerBackgroundAgentJob combines allocation + attachment', async () => {
    const job = registerBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
      promise: Promise.resolve(42),
    })
    expect(job.status).toBe('running')
    await Promise.resolve()
    await Promise.resolve()
    expect(job.status).toBe('completed')
    expect(job.result).toBe(42)
  })

  test('appendBackgroundAgentChunk buffers chunks in arrival order', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    appendBackgroundAgentChunk(job.jobId, {
      type: 'text',
      payload: 'first',
      timestamp: 1000,
    })
    appendBackgroundAgentChunk(job.jobId, {
      type: 'text',
      payload: 'second',
      timestamp: 1001,
    })
    expect(job.chunks.length).toBe(2)
    expect(job.chunks[0]!.payload).toBe('first')
    expect(job.chunks[1]!.payload).toBe('second')
  })

  test('appendBackgroundAgentChunk is a no-op for unknown jobId', () => {
    expect(() =>
      appendBackgroundAgentChunk('bg-agent-unknown', {
        type: 'text',
        payload: 'x',
        timestamp: 1,
      }),
    ).not.toThrow()
  })

  test('readNewBackgroundAgentChunks returns only unconsumed chunks and advances offset', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    for (let i = 0; i < 5; i++) {
      appendBackgroundAgentChunk(job.jobId, {
        type: 'text',
        payload: `chunk-${i}`,
        timestamp: i,
      })
    }
    const first = readNewBackgroundAgentChunks(job)
    expect(first.length).toBe(5)
    expect(first.map((c) => c.payload)).toEqual([
      'chunk-0',
      'chunk-1',
      'chunk-2',
      'chunk-3',
      'chunk-4',
    ])
    expect(job.readOffset).toBe(5)

    // A second read immediately after returns nothing new.
    const second = readNewBackgroundAgentChunks(job)
    expect(second).toEqual([])

    // After appending more, a third read returns only the new chunks.
    appendBackgroundAgentChunk(job.jobId, {
      type: 'text',
      payload: 'chunk-5',
      timestamp: 5,
    })
    const third = readNewBackgroundAgentChunks(job)
    expect(third.length).toBe(1)
    expect(third[0]!.payload).toBe('chunk-5')
  })

  test('appendBackgroundAgentChunk evicts oldest entries past the ring buffer bound', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    // MAX_BUFFERED_CHUNKS is 200; push well past it.
    for (let i = 0; i < 210; i++) {
      appendBackgroundAgentChunk(job.jobId, {
        type: 'text',
        payload: i,
        timestamp: i,
      })
    }
    // Buffer should be bounded to ~200 (eviction keeps it from growing).
    expect(job.chunks.length).toBeLessThanOrEqual(200)
    // The oldest chunks should have been evicted; readOffset is adjusted to
    // stay valid so a poll returns only the surviving unconsumed chunks.
    expect(job.readOffset).toBeGreaterThanOrEqual(0)
    const polled = readNewBackgroundAgentChunks(job)
    expect(polled.length).toBe(job.chunks.length)
    expect(takeDroppedBackgroundAgentChunkCount(job)).toBe(10)
    expect(takeDroppedBackgroundAgentChunkCount(job)).toBe(0)
  })

  test('bounds chunks by UTF-8 bytes rather than JavaScript character count', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    appendBackgroundAgentChunk(job.jobId, {
      type: 'text',
      payload: '🙂'.repeat(20_000),
      timestamp: 1,
    })

    expect(job.chunks[0]?.payload).toMatchObject({
      truncated: true,
      originalBytes: 80_002,
    })
    expect(
      Buffer.byteLength(JSON.stringify(job.chunks[0]?.payload), 'utf8'),
    ).toBeLessThanOrEqual(64 * 1024)
  })

  test('caps consumer cursor count and clamps oversized cursors', () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    appendBackgroundAgentChunk(job.jobId, {
      type: 'text',
      payload: 'first',
      timestamp: 1,
    })

    for (let index = 0; index < 40; index++) {
      readBackgroundAgentChunks({
        job,
        consumerId: `consumer-${index}`,
        cursor: index === 39 ? Number.MAX_SAFE_INTEGER : undefined,
      })
    }
    expect(job.consumerCursors.size).toBeLessThanOrEqual(32)

    appendBackgroundAgentChunk(job.jobId, {
      type: 'text',
      payload: 'second',
      timestamp: 2,
    })
    const next = readBackgroundAgentChunks({
      job,
      consumerId: 'consumer-39',
    })
    expect(next.chunks.map((chunk) => chunk.payload)).toEqual(['second'])
    expect(next.nextCursor).toBe(2)
  })

  test('tracks ownership and enforces the per-root running quota', () => {
    const owner = {
      clientSessionId: 'session-1',
      rootRunId: 'root-1',
      parentRunId: 'parent-run',
      parentAgentId: 'parent-agent',
      userInputId: 'input-1',
    }
    const jobs = Array.from({ length: 8 }, (_, index) =>
      allocateBackgroundAgentJob({
        agentType: 'basher',
        agentName: `Basher ${index}`,
        owner,
      }),
    )

    expect(backgroundAgentJobOwnedBy(jobs[0], owner)).toBe(true)
    expect(
      backgroundAgentJobOwnedBy(jobs[0], {
        clientSessionId: owner.clientSessionId,
        rootRunId: 'another-root',
      }),
    ).toBe(false)
    expect(() =>
      allocateBackgroundAgentJob({
        agentType: 'basher',
        agentName: 'One too many',
        owner,
      }),
    ).toThrow('concurrency limit reached for this run (8)')
  })

  test('cancelBackgroundAgentJob aborts a running coroutine and preserves cancelled status', async () => {
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    let rejectPromise!: (reason: unknown) => void
    attachBackgroundAgentPromise(
      job,
      new Promise((_resolve, reject) => {
        rejectPromise = reject
      }),
    )
    const result = cancelBackgroundAgentJob(job.jobId)
    expect(result).toEqual({ cancelled: true, status: 'cancelled' })
    expect(job.abortController.signal.aborted).toBe(true)
    rejectPromise(new Error('aborted'))
    await Promise.resolve()
    expect(job.status).toBe('cancelled')
  })

  test('a pre-allocated jobId is available before the promise attaches', () => {
    // Validates the temporal-dead-zone fix: the chunk handler can reference
    // job.jobId synchronously before attachBackgroundAgentPromise is called.
    const job = allocateBackgroundAgentJob({
      agentType: 'basher',
      agentName: 'Basher',
    })
    const capturedId = job.jobId
    // Simulate a synchronous onResponseChunk firing before the promise exists.
    appendBackgroundAgentChunk(capturedId, {
      type: 'text',
      payload: 'early',
      timestamp: 0,
    })
    // Now attach the coroutine.
    attachBackgroundAgentPromise(job, Promise.resolve('ok'))
    expect(job.chunks.length).toBe(1)
    expect(job.chunks[0]!.payload).toBe('early')
  })
})
