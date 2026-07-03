import { describe, expect, it } from 'bun:test'

import { chatAdVariantForUser } from '../_components/ad-experiment'

describe('chatAdVariantForUser', () => {
  it('is deterministic for a given user id', () => {
    for (const id of ['user-a', 'user-b', 'a1b2c3d4', '42']) {
      expect(chatAdVariantForUser(id)).toBe(chatAdVariantForUser(id))
    }
  })

  it('assigns signed-out sessions to control', () => {
    expect(chatAdVariantForUser(undefined)).toBe('control')
    expect(chatAdVariantForUser(null)).toBe('control')
    expect(chatAdVariantForUser('')).toBe('control')
  })

  it('splits a population roughly 50/50', () => {
    const total = 10_000
    let serverRendered = 0
    for (let i = 0; i < total; i++) {
      if (chatAdVariantForUser(`synthetic-user-${i}`) === 'server_rendered') {
        serverRendered += 1
      }
    }
    expect(serverRendered).toBeGreaterThan(total * 0.45)
    expect(serverRendered).toBeLessThan(total * 0.55)
  })
})
