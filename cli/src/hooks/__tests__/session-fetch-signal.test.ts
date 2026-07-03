import { describe, test, expect } from 'bun:test'

import { sessionFetchSignal } from '../use-freebuff-session'

// Every session API call gets this combined signal. The load-bearing cases:
// the timeout must fire even when no caller signal is passed (DELETE paths),
// and a poll-loop restart abort must win over the timeout so restarts stay
// instant.

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('sessionFetchSignal', () => {
  test('aborts after the timeout when no caller signal is given', async () => {
    const signal = sessionFetchSignal(undefined, 5)
    expect(signal.aborted).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as DOMException).name).toBe('TimeoutError')
  })

  test('propagates the caller abort before the timeout fires', async () => {
    const caller = new AbortController()
    const signal = sessionFetchSignal(caller.signal, 60_000)
    expect(signal.aborted).toBe(false)
    caller.abort()
    await nextTick()
    expect(signal.aborted).toBe(true)
    expect((signal.reason as DOMException).name).toBe('AbortError')
  })

  test('times out even with a never-aborted caller signal', async () => {
    const caller = new AbortController()
    const signal = sessionFetchSignal(caller.signal, 5)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as DOMException).name).toBe('TimeoutError')
  })

  test('reflects an already-aborted caller signal immediately', () => {
    const caller = new AbortController()
    caller.abort()
    const signal = sessionFetchSignal(caller.signal, 60_000)
    expect(signal.aborted).toBe(true)
  })
})
