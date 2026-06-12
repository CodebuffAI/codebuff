import { describe, expect, it } from 'bun:test'

import {
  FREEBUFF_REFERRAL_TIERS,
  FREEBUFF_WATERMARK_REMOVAL_REFERRALS,
  FREEBUFF_WATERMARK_REMOVAL_TIER,
  MAX_FREEBUFF_REFERRAL_TIER,
  MIN_GITHUB_ACCOUNT_AGE_MONTHS,
  getNextReferralTier,
  getReferralTier,
  getTierLimits,
  isGithubAccountOldEnoughForReferral,
} from '../constants/freebuff-referral-tiers'

const NOW = Date.parse('2026-06-12T00:00:00Z')

function monthsAgo(months: number): number {
  const date = new Date(NOW)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.getTime()
}

describe('FREEBUFF_REFERRAL_TIERS', () => {
  it('is sorted ascending by referrals required with strictly growing limits', () => {
    for (let i = 1; i < FREEBUFF_REFERRAL_TIERS.length; i++) {
      const prev = FREEBUFF_REFERRAL_TIERS[i - 1]
      const next = FREEBUFF_REFERRAL_TIERS[i]
      expect(next.tier).toBe(prev.tier + 1)
      expect(next.referralsRequired).toBeGreaterThan(prev.referralsRequired)
      expect(next.standardModelDailyLimit).toBeGreaterThan(
        prev.standardModelDailyLimit,
      )
      expect(next.premiumModelDailyLimit).toBeGreaterThan(
        prev.premiumModelDailyLimit,
      )
    }
  })

  it('starts at tier 0 with 0 referrals and the watermark on', () => {
    expect(FREEBUFF_REFERRAL_TIERS[0]).toMatchObject({
      tier: 0,
      referralsRequired: 0,
      removesWatermark: false,
    })
  })

  it('exposes the watermark unlock tier', () => {
    expect(FREEBUFF_WATERMARK_REMOVAL_TIER).toBe(1)
    expect(FREEBUFF_WATERMARK_REMOVAL_REFERRALS).toBe(1)
  })

  it('follows the 1 / +2 (3) / +4 (7) referral ladder', () => {
    expect(FREEBUFF_REFERRAL_TIERS.map((t) => t.referralsRequired)).toEqual([
      0, 1, 3, 7,
    ])
  })
})

describe('getReferralTier', () => {
  it('maps counts to the highest unlocked tier', () => {
    expect(getReferralTier(0).tier).toBe(0)
    expect(getReferralTier(1).tier).toBe(1)
    expect(getReferralTier(2).tier).toBe(1)
    expect(getReferralTier(3).tier).toBe(2)
    expect(getReferralTier(6).tier).toBe(2)
    expect(getReferralTier(7).tier).toBe(MAX_FREEBUFF_REFERRAL_TIER)
    expect(getReferralTier(100).tier).toBe(MAX_FREEBUFF_REFERRAL_TIER)
  })

  it('treats null/undefined/negative counts as tier 0', () => {
    expect(getReferralTier(null).tier).toBe(0)
    expect(getReferralTier(undefined).tier).toBe(0)
    expect(getReferralTier(-3).tier).toBe(0)
  })
})

describe('getTierLimits', () => {
  it('returns the tier row and clamps out-of-range tiers', () => {
    expect(getTierLimits(1).standardModelDailyLimit).toBe(
      FREEBUFF_REFERRAL_TIERS[1].standardModelDailyLimit,
    )
    expect(getTierLimits(-1).tier).toBe(0)
    expect(getTierLimits(99).tier).toBe(MAX_FREEBUFF_REFERRAL_TIER)
  })
})

describe('getNextReferralTier', () => {
  it('returns the next tier and null when maxed', () => {
    expect(getNextReferralTier(0)?.tier).toBe(1)
    expect(getNextReferralTier(1)?.tier).toBe(2)
    expect(getNextReferralTier(3)?.tier).toBe(3)
    expect(getNextReferralTier(7)).toBeNull()
  })
})

describe('isGithubAccountOldEnoughForReferral', () => {
  it('accepts accounts at or beyond the age threshold', () => {
    expect(
      isGithubAccountOldEnoughForReferral(
        monthsAgo(MIN_GITHUB_ACCOUNT_AGE_MONTHS),
        NOW,
      ),
    ).toBe(true)
    expect(isGithubAccountOldEnoughForReferral(monthsAgo(36), NOW)).toBe(true)
  })

  it('rejects accounts younger than the threshold', () => {
    expect(
      isGithubAccountOldEnoughForReferral(
        monthsAgo(MIN_GITHUB_ACCOUNT_AGE_MONTHS - 1),
        NOW,
      ),
    ).toBe(false)
    expect(isGithubAccountOldEnoughForReferral(NOW, NOW)).toBe(false)
  })

  it('rejects missing or invalid creation dates', () => {
    expect(isGithubAccountOldEnoughForReferral(null, NOW)).toBe(false)
    expect(isGithubAccountOldEnoughForReferral(undefined, NOW)).toBe(false)
    expect(isGithubAccountOldEnoughForReferral(Number.NaN, NOW)).toBe(false)
  })
})
