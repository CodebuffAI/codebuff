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
    for (let i = 0; i < 120; i++) {
      expect(checkComposioRateLimit('user-1')).toEqual({
        limited: false,
      })
    }
  })

  test('limits execution after the per-minute limit', () => {
    for (let i = 0; i < 120; i++) {
      checkComposioRateLimit('user-1')
    }

    const result = checkComposioRateLimit('user-1')
    expect(result.limited).toBe(true)
    if (result.limited) {
      expect(result.windowName).toBe('1 minute')
      expect(result.retryAfterMs).toBeGreaterThan(0)
    }
  })
})
