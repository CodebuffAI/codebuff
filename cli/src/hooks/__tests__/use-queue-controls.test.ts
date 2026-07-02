import { describe, test, expect, mock } from 'bun:test'

import { createQueueCtrlCHandler } from '../use-queue-controls'
import {
  beginQueuedMessageProcessing,
  completeQueuedMessageProcessing,
  createQueueProcessingOwnership,
  runQueuedMessage,
} from '../use-message-queue'

import type { QueuedMessage } from '../use-message-queue'

describe('createQueueProcessingOwnership', () => {
  test('stale owner cannot release newer queue processing owner', () => {
    const activeQueueProcessingOwnerRef = { current: null as symbol | null }

    const ownerA = createQueueProcessingOwnership(activeQueueProcessingOwnerRef)
    expect(ownerA.isCurrentQueueProcessingOwner()).toBe(true)

    const ownerB = createQueueProcessingOwnership(activeQueueProcessingOwnerRef)
    expect(ownerA.isCurrentQueueProcessingOwner()).toBe(false)
    expect(ownerB.isCurrentQueueProcessingOwner()).toBe(true)

    ownerA.releaseQueueProcessingOwner()
    expect(ownerB.isCurrentQueueProcessingOwner()).toBe(true)
    expect(activeQueueProcessingOwnerRef.current).not.toBe(null)

    ownerB.releaseQueueProcessingOwner()
    expect(activeQueueProcessingOwnerRef.current).toBe(null)
  })

  test('stale finally-style cleanup leaves newer processing lock and watchdog intact', () => {
    const activeQueueProcessingOwnerRef = { current: null as symbol | null }
    const isProcessingQueueRef = { current: false }
    const watchdogTimeoutRef = { current: Symbol('watchdog') as symbol | null }

    const ownerA = createQueueProcessingOwnership(activeQueueProcessingOwnerRef)

    // A newer queued send starts after owner A was aborted but before owner A's
    // promise settles, replacing the active owner and owning the shared refs.
    const ownerB = createQueueProcessingOwnership(activeQueueProcessingOwnerRef)
    isProcessingQueueRef.current = true

    if (ownerA.isCurrentQueueProcessingOwner()) {
      isProcessingQueueRef.current = false
      watchdogTimeoutRef.current = null
      ownerA.releaseQueueProcessingOwner()
    }

    expect(isProcessingQueueRef.current).toBe(true)
    expect(watchdogTimeoutRef.current).not.toBe(null)
    expect(ownerB.isCurrentQueueProcessingOwner()).toBe(true)
  })
})

describe('runQueuedMessage', () => {
  const createDeferred = () => {
    let resolvePromise!: () => void
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve
    })

    return { promise, resolve: resolvePromise }
  }

  const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

  const createTimerHarness = () => {
    const callbacks = new Map<ReturnType<typeof setTimeout>, () => void>()
    const setTimeoutFn = (callback: () => void) => {
      const timer = setTimeout(() => {}, 0)
      clearTimeout(timer)
      callbacks.set(timer, callback)
      return timer
    }
    const clearTimeoutFn = (timer: ReturnType<typeof setTimeout>) => {
      callbacks.delete(timer)
      clearTimeout(timer)
    }

    return { callbacks, setTimeoutFn, clearTimeoutFn }
  }

  test('processing lock is acquired before queue mutation and send starts', () => {
    const activeQueueProcessingOwnerRef = { current: null as symbol | null }
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }
    const watchdogTimeoutRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }
    const timerHarness = createTimerHarness()
    const queue: QueuedMessage[] = [{ content: 'queued', attachments: [] }]
    const messageToProcess = queue[0]
    expect(messageToProcess).toBeDefined()

    const queueProcessingRun = beginQueuedMessageProcessing({
      isProcessingQueueRef,
      isQueuePausedRef,
      watchdogTimeoutRef,
      queueProcessingOwnerRef: activeQueueProcessingOwnerRef,
      setCanProcessQueue: () => {},
      setTimeoutFn: timerHarness.setTimeoutFn,
      clearTimeoutFn: timerHarness.clearTimeoutFn,
    })

    // Mirrors `processNextMessage`: the lock must be visible before queue state
    // mutation so duplicate updater/re-entry paths see that processing is active.
    expect(isProcessingQueueRef.current).toBe(true)
    const remainingMessages = queue.slice(1)
    expect(isProcessingQueueRef.current).toBe(true)
    expect(remainingMessages).toHaveLength(0)

    completeQueuedMessageProcessing({
      messageToProcess: messageToProcess!,
      sendMessage: () => Promise.resolve(),
      isProcessingQueueRef,
      watchdogTimeoutRef,
      queueProcessingRun,
    })
  })

  test('stale completion cannot clear newer queued-send processing lock or watchdog', async () => {
    const activeQueueProcessingOwnerRef = { current: null as symbol | null }
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }
    const watchdogTimeoutRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }
    let canProcessQueue = false
    const timerHarness = createTimerHarness()
    const runA = createDeferred()
    const runB = createDeferred()

    runQueuedMessage({
      messageToProcess: { content: 'run A', attachments: [] },
      sendMessage: () => runA.promise,
      isProcessingQueueRef,
      isQueuePausedRef,
      watchdogTimeoutRef,
      queueProcessingOwnerRef: activeQueueProcessingOwnerRef,
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      setTimeoutFn: timerHarness.setTimeoutFn,
      clearTimeoutFn: timerHarness.clearTimeoutFn,
    })

    // Abort cleanup from run A releases the processing lock, allowing run B to
    // start before run A's promise settles.
    isProcessingQueueRef.current = false

    runQueuedMessage({
      messageToProcess: { content: 'run B', attachments: [] },
      sendMessage: () => runB.promise,
      isProcessingQueueRef,
      isQueuePausedRef,
      watchdogTimeoutRef,
      queueProcessingOwnerRef: activeQueueProcessingOwnerRef,
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      setTimeoutFn: timerHarness.setTimeoutFn,
      clearTimeoutFn: timerHarness.clearTimeoutFn,
    })

    const runBWatchdog = watchdogTimeoutRef.current
    expect(isProcessingQueueRef.current).toBe(true)
    expect(runBWatchdog).not.toBe(null)

    runA.resolve()
    await flushPromises()

    expect(isProcessingQueueRef.current).toBe(true)
    expect(watchdogTimeoutRef.current).toBe(runBWatchdog)
    expect(activeQueueProcessingOwnerRef.current).not.toBe(null)
    expect(canProcessQueue).toBe(false)

    runB.resolve()
    await flushPromises()

    expect(isProcessingQueueRef.current).toBe(false)
    expect(watchdogTimeoutRef.current).toBe(null)
    expect(activeQueueProcessingOwnerRef.current).toBe(null)
  })

  test('stale watchdog cannot clear newer queued-send processing lock or timer', () => {
    const activeQueueProcessingOwnerRef = { current: null as symbol | null }
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }
    const watchdogTimeoutRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }
    let canProcessQueue = false
    const timerHarness = createTimerHarness()
    const runA = createDeferred()
    const runB = createDeferred()

    runQueuedMessage({
      messageToProcess: { content: 'run A', attachments: [] },
      sendMessage: () => runA.promise,
      isProcessingQueueRef,
      isQueuePausedRef,
      watchdogTimeoutRef,
      queueProcessingOwnerRef: activeQueueProcessingOwnerRef,
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      setTimeoutFn: timerHarness.setTimeoutFn,
      clearTimeoutFn: timerHarness.clearTimeoutFn,
    })
    const runAWatchdog = watchdogTimeoutRef.current
    expect(runAWatchdog).not.toBe(null)
    const staleWatchdogCallback = timerHarness.callbacks.get(runAWatchdog!)
    expect(staleWatchdogCallback).toBeDefined()

    // Abort cleanup from run A releases the processing lock, allowing run B to
    // start before run A's watchdog callback fires. Starting run B clears run A's
    // active timer entry, so capture the stale callback first to exercise the
    // real queued-send watchdog branch after run B owns the shared refs.
    isProcessingQueueRef.current = false

    runQueuedMessage({
      messageToProcess: { content: 'run B', attachments: [] },
      sendMessage: () => runB.promise,
      isProcessingQueueRef,
      isQueuePausedRef,
      watchdogTimeoutRef,
      queueProcessingOwnerRef: activeQueueProcessingOwnerRef,
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      setTimeoutFn: timerHarness.setTimeoutFn,
      clearTimeoutFn: timerHarness.clearTimeoutFn,
    })
    const runBWatchdog = watchdogTimeoutRef.current
    expect(runBWatchdog).not.toBe(null)

    staleWatchdogCallback!()

    expect(isProcessingQueueRef.current).toBe(true)
    expect(watchdogTimeoutRef.current).toBe(runBWatchdog)
    expect(activeQueueProcessingOwnerRef.current).not.toBe(null)
    expect(canProcessQueue).toBe(false)

    const currentWatchdogCallback = timerHarness.callbacks.get(runBWatchdog!)
    currentWatchdogCallback?.()

    expect(isProcessingQueueRef.current).toBe(false)
    expect(watchdogTimeoutRef.current).toBe(null)
    expect(activeQueueProcessingOwnerRef.current).toBe(null)
    expect(canProcessQueue).toBe(true)
  })
})

describe('createQueueCtrlCHandler', () => {
  const setupHandler = (
    overrides: Partial<Parameters<typeof createQueueCtrlCHandler>[0]> = {},
  ) => {
    const clearQueue = mock(() => [] as QueuedMessage[])
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
