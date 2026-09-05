import { describe, expect, test } from 'bun:test'

import { resolveFreebuffLimitNudge } from '../freebuff-limit-nudge'

const USAGE = {
  dayUsed: 0, dayLimit: 3, fiveDayUsed: 0, fiveDayLimit: 10,
  monthUsed: 0, monthLimit: 30, dayPremiumUsed: 0, dayPremiumLimit: 3,
  dayResetAt: '2026-09-02T07:00:00Z', periodEndsAt: '2026-09-28T00:00:00Z',
  monthSpendUsd: 0, monthSpendLimitUsd: 15,
}

describe('resolveFreebuffLimitNudge', () => {
  test('quiet below 80% everywhere', () => {
    expect(
      resolveFreebuffLimitNudge({
        subscription: { tierId: 'starter', usage: { ...USAGE, dayUsed: 2 } },
        rateLimits: null,
      }),
    ).toBeNull()
  })

  test('a subscriber nudges on the first window at 80%', () => {
    const n = resolveFreebuffLimitNudge({
      subscription: { tierId: 'starter', usage: { ...USAGE, fiveDayUsed: 8 } },
    })
    expect(n).toEqual({ kind: 'near', label: 'weekly plan sessions', used: 8, limit: 10 })
  })

  test("the server's blockedBy IS the wall — no client arithmetic", () => {
    const n = resolveFreebuffLimitNudge({
      subscription: { tierId: 'starter', usage: USAGE, blockedBy: 'daily' },
    })
    expect(n).toEqual({ kind: 'wall', label: 'your plan sessions' })
  })

  test('a free account walls on any exhausted pool row', () => {
    const n = resolveFreebuffLimitNudge({
      rateLimits: { m: { recentCount: 4, limit: 4, poolLabel: 'Premium' } },
    })
    expect(n).toEqual({ kind: 'wall', label: 'your free sessions' })
  })

  test('a free account nudges with the pool label at 80%', () => {
    const n = resolveFreebuffLimitNudge({
      rateLimits: { m: { recentCount: 3.5, limit: 4, poolLabel: 'Premium' } },
    })
    expect(n).toEqual({ kind: 'near', label: 'premium sessions', used: 3.5, limit: 4 })
  })

  test('unlimited rows (limit 0) never nudge', () => {
    expect(
      resolveFreebuffLimitNudge({
        rateLimits: { m: { recentCount: 100, limit: 0 } },
      }),
    ).toBeNull()
  })
})
