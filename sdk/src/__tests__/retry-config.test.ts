import { describe, expect, test } from 'bun:test'

import {
  computeBackoffDelayMs,
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
  RETRY_BACKOFF_JITTER_FRACTION,
  waitForBackoffDelay,
} from '../retry-config'

describe('retry-config constants', () => {
  test('exposes the canonical retry constants', () => {
    expect(MAX_RETRIES_PER_MESSAGE).toBe(3)
    expect(RETRY_BACKOFF_BASE_DELAY_MS).toBe(1000)
    expect(RETRY_BACKOFF_MAX_DELAY_MS).toBe(8000)
    expect(RETRY_BACKOFF_JITTER_FRACTION).toBe(0.2)
  })
})

describe('waitForBackoffDelay', () => {
  test('rejects immediately when already aborted', async () => {
    const abortController = new AbortController()
    abortController.abort(new Error('user cancelled'))

    await expect(
      waitForBackoffDelay({
        delayMs: RETRY_BACKOFF_BASE_DELAY_MS,
        signal: abortController.signal,
      }),
    ).rejects.toThrow('user cancelled')
  })

  test('rejects promptly when aborted during the delay', async () => {
    const abortController = new AbortController()
    const delayPromise = waitForBackoffDelay({
      delayMs: RETRY_BACKOFF_MAX_DELAY_MS,
      signal: abortController.signal,
    })

    abortController.abort('retry cancelled')

    await expect(delayPromise).rejects.toThrow('retry cancelled')
  })

  test('rejects when aborted after timer creation but before listener registration', async () => {
    const abortController = new AbortController()
    const originalSetTimeout = globalThis.setTimeout

    try {
      globalThis.setTimeout = ((
        ...args: Parameters<typeof globalThis.setTimeout>
      ) => {
        const timeoutId = originalSetTimeout(...args)
        abortController.abort('setup race cancelled')
        return timeoutId
      }) as typeof globalThis.setTimeout

      await expect(
        waitForBackoffDelay({
          delayMs: RETRY_BACKOFF_MAX_DELAY_MS,
          signal: abortController.signal,
        }),
      ).rejects.toThrow('setup race cancelled')
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })

  test('resolves normally when the delay elapses', async () => {
    await expect(waitForBackoffDelay({ delayMs: 1 })).resolves.toBeUndefined()
  })
})

describe('computeBackoffDelayMs', () => {
  test('exponential growth without jitter (deterministic)', () => {
    // attempt 0 -> base * 2^0 = 1000
    expect(computeBackoffDelayMs({ attempt: 0, jitter: false })).toBe(1000)
    // attempt 1 -> base * 2^1 = 2000
    expect(computeBackoffDelayMs({ attempt: 1, jitter: false })).toBe(2000)
    // attempt 2 -> base * 2^2 = 4000
    expect(computeBackoffDelayMs({ attempt: 2, jitter: false })).toBe(4000)
    // attempt 3 -> base * 2^3 = 8000 (at cap)
    expect(computeBackoffDelayMs({ attempt: 3, jitter: false })).toBe(8000)
  })

  test('caps at RETRY_BACKOFF_MAX_DELAY_MS without jitter', () => {
    expect(computeBackoffDelayMs({ attempt: 4, jitter: false })).toBe(
      RETRY_BACKOFF_MAX_DELAY_MS,
    )
    expect(computeBackoffDelayMs({ attempt: 10, jitter: false })).toBe(
      RETRY_BACKOFF_MAX_DELAY_MS,
    )
    expect(computeBackoffDelayMs({ attempt: 100, jitter: false })).toBe(
      RETRY_BACKOFF_MAX_DELAY_MS,
    )
  })

  test('honors a custom baseDelayMs', () => {
    expect(
      computeBackoffDelayMs({ attempt: 0, baseDelayMs: 500, jitter: false }),
    ).toBe(500)
    expect(
      computeBackoffDelayMs({ attempt: 2, baseDelayMs: 500, jitter: false }),
    ).toBe(2000)
    // custom base still capped at the global max
    expect(
      computeBackoffDelayMs({ attempt: 5, baseDelayMs: 500, jitter: false }),
    ).toBe(RETRY_BACKOFF_MAX_DELAY_MS)
  })

  test('treats negative attempt as 0', () => {
    expect(computeBackoffDelayMs({ attempt: -1, jitter: false })).toBe(
      RETRY_BACKOFF_BASE_DELAY_MS,
    )
    expect(computeBackoffDelayMs({ attempt: -100, jitter: false })).toBe(
      RETRY_BACKOFF_BASE_DELAY_MS,
    )
  })

  test('applies jitter within ±JITTER_FRACTION bounds', () => {
    // With jitter on, the result must stay within
    // [base * (1 - frac), base * (1 + frac)] (rounded), and never exceed the cap.
    const attempt = 1 // base = 2000
    const lo = Math.round(2000 * (1 - RETRY_BACKOFF_JITTER_FRACTION))
    const hi = Math.round(2000 * (1 + RETRY_BACKOFF_JITTER_FRACTION))
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffDelayMs({ attempt })
      expect(delay).toBeGreaterThanOrEqual(lo)
      expect(delay).toBeLessThanOrEqual(hi)
    }
  })

  test('jitter never exceeds the max cap', () => {
    // At the cap (attempt 3+), jitter must not push past MAX_DELAY_MS.
    for (let i = 0; i < 50; i++) {
      expect(computeBackoffDelayMs({ attempt: 3 })).toBeLessThanOrEqual(
        RETRY_BACKOFF_MAX_DELAY_MS,
      )
      expect(computeBackoffDelayMs({ attempt: 10 })).toBeLessThanOrEqual(
        RETRY_BACKOFF_MAX_DELAY_MS,
      )
    }
  })

  test('jitter defaults to true', () => {
    // Without an explicit jitter flag, the function should still produce
    // in-bounds jittered values (i.e. not the exact deterministic value across
    // many calls, and within the jitter band).
    const attempt = 2 // base = 4000
    const lo = Math.round(4000 * (1 - RETRY_BACKOFF_JITTER_FRACTION))
    const hi = Math.round(4000 * (1 + RETRY_BACKOFF_JITTER_FRACTION))
    const values = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffDelayMs({ attempt })
      values.add(delay)
      expect(delay).toBeGreaterThanOrEqual(lo)
      expect(delay).toBeLessThanOrEqual(hi)
    }
    // With ±20% jitter over 50 samples, we expect at least some variation.
    expect(values.size).toBeGreaterThan(1)
  })

  test('returns an integer', () => {
    expect(Number.isInteger(computeBackoffDelayMs({ attempt: 0, jitter: false }))).toBe(true)
    expect(Number.isInteger(computeBackoffDelayMs({ attempt: 1, jitter: false }))).toBe(true)
    // jittered results should also be integers (Math.round)
    for (let i = 0; i < 20; i++) {
      expect(Number.isInteger(computeBackoffDelayMs({ attempt: i }))).toBe(true)
    }
  })
})