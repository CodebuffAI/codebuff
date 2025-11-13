import { describe, test, expect, mock } from 'bun:test'

import { createQueueCtrlCHandler } from '../use-queue-controls'

describe('createQueueCtrlCHandler', () => {
  const setupHandler = (
    overrides: Partial<Parameters<typeof createQueueCtrlCHandler>[0]> = {},
  ) => {
    const clearQueue = mock(() => [] as string[])
    const resumeQueue = mock(() => {})
    const baseHandleCtrlC = mock(() => true as const)

    const handler = createQueueCtrlCHandler({
      queuePaused: false,
      queuedCount: 0,
      inputHasText: false,
      clearQueue,
      resumeQueue,
      baseHandleCtrlC,
      ...overrides,
    })

    return { handler, clearQueue, resumeQueue, baseHandleCtrlC }
  }

  test('delegates to base handler when input has text even if queue is paused', () => {
    const { handler, clearQueue, resumeQueue, baseHandleCtrlC } = setupHandler({
      queuePaused: true,
      queuedCount: 2,
      inputHasText: true,
    })

    handler()

    expect(clearQueue.mock.calls.length).toBe(0)
    expect(resumeQueue.mock.calls.length).toBe(0)
    expect(baseHandleCtrlC.mock.calls.length).toBe(1)
  })

  test('clears queued items when paused with pending work and input is empty', () => {
    const { handler, clearQueue, resumeQueue, baseHandleCtrlC } = setupHandler({
      queuePaused: true,
      queuedCount: 3,
      inputHasText: false,
    })

    handler()

    expect(clearQueue.mock.calls.length).toBe(1)
    expect(resumeQueue.mock.calls.length).toBe(1)
    expect(baseHandleCtrlC.mock.calls.length).toBe(0)
  })

  test('delegates when there are no queued items to cancel', () => {
    const { handler, clearQueue, resumeQueue, baseHandleCtrlC } = setupHandler({
      queuePaused: true,
      queuedCount: 0,
    })

    handler()

    expect(clearQueue.mock.calls.length).toBe(0)
    expect(resumeQueue.mock.calls.length).toBe(0)
    expect(baseHandleCtrlC.mock.calls.length).toBe(1)
  })
})
