import { describe, expect, it } from 'bun:test'

import { createFixedWindowRateLimiter } from '../rate-limit'

describe('createFixedWindowRateLimiter', () => {
  it('allows up to `max` requests per window, then limits', () => {
    const rl = createFixedWindowRateLimiter({ windowMs: 1000, max: 3 })
    const t = 0
    expect(rl.limited('a', t)).toBe(false) // 1
    expect(rl.limited('a', t)).toBe(false) // 2
    expect(rl.limited('a', t)).toBe(false) // 3
    expect(rl.limited('a', t)).toBe(true) // 4 -> over
  })

  it('resets after the window elapses', () => {
    const rl = createFixedWindowRateLimiter({ windowMs: 1000, max: 1 })
    expect(rl.limited('a', 0)).toBe(false)
    expect(rl.limited('a', 500)).toBe(true) // still in window
    expect(rl.limited('a', 1000)).toBe(false) // window rolled over
  })

  it('tracks keys independently', () => {
    const rl = createFixedWindowRateLimiter({ windowMs: 1000, max: 1 })
    expect(rl.limited('a', 0)).toBe(false)
    expect(rl.limited('b', 0)).toBe(false) // different key, own budget
    expect(rl.limited('a', 0)).toBe(true)
  })
})
