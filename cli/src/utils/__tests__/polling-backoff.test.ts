import { describe, expect, test } from 'bun:test'

import { failedPollDelayMs, jitterPollIntervalMs } from '../polling-backoff'

describe('polling backoff', () => {
  test('uses capped exponential windows with equal jitter', () => {
    const delay = (failures: number, random: number) =>
      failedPollDelayMs({
        consecutiveFailures: failures,
        random: () => random,
      })

    expect(delay(1, 0)).toBe(10_000)
    expect(delay(1, 1)).toBe(20_000)
    expect(delay(2, 0)).toBe(20_000)
    expect(delay(3, 1)).toBe(80_000)
    expect(delay(20, 0)).toBe(150_000)
    expect(delay(20, 1)).toBe(300_000)
  })

  test('jitters successful poll cadences around the requested interval', () => {
    expect(jitterPollIntervalMs({ intervalMs: 30_000, random: () => 0 })).toBe(
      24_000,
    )
    expect(
      jitterPollIntervalMs({ intervalMs: 30_000, random: () => 0.5 }),
    ).toBe(30_000)
    expect(jitterPollIntervalMs({ intervalMs: 30_000, random: () => 1 })).toBe(
      36_000,
    )
  })

  test('never schedules before a server Retry-After floor', () => {
    const delay = (random: number) =>
      failedPollDelayMs({
        consecutiveFailures: 1,
        retryAfterMs: 30_000,
        random: () => random,
      })

    expect(delay(0)).toBe(30_000)
    expect(delay(1)).toBe(36_000)
    expect(
      failedPollDelayMs({
        consecutiveFailures: 1,
        retryAfterMs: Number.MAX_VALUE,
        random: () => 1,
      }),
    ).toBe(300_000)
  })
})
