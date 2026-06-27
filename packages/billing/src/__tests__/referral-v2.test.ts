import { describe, expect, it } from 'bun:test'

import { nextActivationTier } from '../referral-v2'

describe('nextActivationTier', () => {
  it('sets the tier on first activation', () => {
    expect(nextActivationTier(null, 'limited')).toBe('limited')
    expect(nextActivationTier(null, 'full')).toBe('full')
  })

  it('upgrades limited → full but never downgrades full → limited', () => {
    expect(nextActivationTier('limited', 'full')).toBe('full')
    expect(nextActivationTier('full', 'limited')).toBe('full')
  })

  it('is stable when the tier does not change', () => {
    expect(nextActivationTier('limited', 'limited')).toBe('limited')
    expect(nextActivationTier('full', 'full')).toBe('full')
  })

  it('treats full as absorbing (idempotent once full)', () => {
    // Once full, any further activation keeps it full.
    expect(nextActivationTier('full', 'full')).toBe('full')
    expect(nextActivationTier('full', 'limited')).toBe('full')
  })
})
