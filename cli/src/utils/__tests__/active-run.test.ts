import { afterEach, describe, expect, it } from 'bun:test'

import {
  ACTIVE_RUN_QUEUE_POLICIES,
  applyActiveRunQueuePolicy,
  clearActiveRun,
  registerActiveRun,
  registerActiveRunStopHandler,
  stopActiveRun,
  type ActiveRunStopReason,
} from '../active-run'

const ALL_REASONS: ActiveRunStopReason[] = [
  'user-interrupt',
  'logout',
  'new-chat',
  'history-resume',
  'session-transition',
  'process-exit',
]

describe('active run ownership', () => {
  afterEach(() => {
    stopActiveRun('process-exit')
  })

  it.each(ALL_REASONS)('passes the %s reason to the run owner', (reason) => {
    const reasons: ActiveRunStopReason[] = []
    registerActiveRun('run-1', (receivedReason) => {
      reasons.push(receivedReason)
    })

    expect(stopActiveRun(reason)).toBe(true)
    expect(reasons).toEqual([reason])
    expect(stopActiveRun(reason)).toBe(false)
  })

  it('does not let stale cleanup clear a newer run', () => {
    const reasons: ActiveRunStopReason[] = []
    registerActiveRun('run-new', (reason) => reasons.push(reason))

    clearActiveRun('run-old')

    expect(stopActiveRun('logout')).toBe(true)
    expect(reasons).toEqual(['logout'])
  })

  it('stops a displaced owner without letting it clear the replacement', () => {
    const oldReasons: ActiveRunStopReason[] = []
    const newReasons: ActiveRunStopReason[] = []
    registerActiveRun('run-old', (reason) => {
      oldReasons.push(reason)
      clearActiveRun('run-old')
    })

    registerActiveRun('run-new', (reason) => newReasons.push(reason))

    expect(oldReasons).toEqual(['user-interrupt'])
    expect(stopActiveRun('new-chat')).toBe(true)
    expect(newReasons).toEqual(['new-chat'])
  })

  it('releases ownership before calling the stop handler', () => {
    const nestedResults: boolean[] = []
    registerActiveRun('run-1', () => {
      nestedResults.push(stopActiveRun('process-exit'))
    })

    stopActiveRun('user-interrupt')

    expect(nestedResults).toEqual([false])
  })

  it('still runs persistent cleanup when the run callback throws', () => {
    const reasons: ActiveRunStopReason[] = []
    const unregister = registerActiveRunStopHandler((reason) => {
      reasons.push(reason)
    })
    registerActiveRun('broken-run', () => {
      throw new Error('broken stop callback')
    })

    try {
      expect(() => stopActiveRun('logout')).not.toThrow()
      expect(reasons).toEqual(['logout'])
    } finally {
      unregister()
    }
  })

  it.each(ALL_REASONS)(
    'runs persistent runtime cleanup for %s even while idle',
    (reason) => {
      const reasons: ActiveRunStopReason[] = []
      const unregister = registerActiveRunStopHandler((receivedReason) => {
        reasons.push(receivedReason)
      })

      try {
        expect(stopActiveRun(reason)).toBe(false)
        expect(reasons).toEqual([reason])
      } finally {
        unregister()
      }
    },
  )
})

describe('active run stop policies', () => {
  const applyQueuePolicy = (reason: ActiveRunStopReason) => {
    const calls: string[] = []
    applyActiveRunQueuePolicy(reason, {
      pauseQueueIfPending: () => calls.push('pause-if-pending'),
      discardQueue: () => calls.push('discard'),
      setCanProcessQueue: (canProcess) =>
        calls.push(`can-process:${canProcess}`),
    })
    return calls
  }

  it('pauses pending work only for a manual interrupt', () => {
    expect(ACTIVE_RUN_QUEUE_POLICIES['user-interrupt']).toBe('pause-if-pending')
    expect(applyQueuePolicy('user-interrupt')).toEqual(['pause-if-pending'])
  })

  it.each([
    'logout',
    'new-chat',
    'history-resume',
    'session-transition',
  ] as const)('clears and blocks the old queue for %s', (reason) => {
    expect(ACTIVE_RUN_QUEUE_POLICIES[reason]).toBe('clear-and-block')
    expect(applyQueuePolicy(reason)).toEqual(['discard'])
  })

  it('preserves and blocks the in-memory queue on exit', () => {
    expect(ACTIVE_RUN_QUEUE_POLICIES['process-exit']).toBe('preserve-and-block')
    expect(applyQueuePolicy('process-exit')).toEqual(['can-process:false'])
  })
})
