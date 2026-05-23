import { beforeEach, describe, expect, test } from 'bun:test'

import {
  checkComposioRateLimit,
  resetComposioRateLimits,
} from '../composio-rate-limiter'

describe('checkComposioRateLimit', () => {
  beforeEach(() => {
    resetComposioRateLimits()
  })

  test('allows requests below the per-minute limit', () => {
    for (let i = 0; i < 30; i++) {
      expect(checkComposioRateLimit('user-1', 'tools')).toEqual({
        limited: false,
      })
    }
  })

  test('limits tool listing after the per-minute limit', () => {
    for (let i = 0; i < 30; i++) {
      checkComposioRateLimit('user-1', 'tools')
    }

    const result = checkComposioRateLimit('user-1', 'tools')
    expect(result.limited).toBe(true)
    if (result.limited) {
      expect(result.windowName).toBe('1 minute')
      expect(result.retryAfterMs).toBeGreaterThan(0)
    }
  })

  test('tracks execute and tools limits independently', () => {
    for (let i = 0; i < 30; i++) {
      checkComposioRateLimit('user-1', 'tools')
    }

    expect(checkComposioRateLimit('user-1', 'tools').limited).toBe(true)
    expect(checkComposioRateLimit('user-1', 'execute')).toEqual({
      limited: false,
    })
  })
})
