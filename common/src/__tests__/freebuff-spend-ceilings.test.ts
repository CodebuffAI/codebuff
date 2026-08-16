import { describe, expect, it } from 'bun:test'

import {
  FREEBUFF_BUDGET_NOTICE,
  FREEBUFF_CAPACITY_NOTICE,
  FREEBUFF_ELEVATED_DAILY_SPEND_USD,
  FREEBUFF_REGION_DAILY_SPEND_USD,
  FREEBUFF_RESTRICTED_DAILY_SPEND_USD,
  FREEBUFF_RESTRICTED_NOTICE,
  freebuffSpendNoticeFor,
  resolveFreebuffHardSpendCeiling,
  resolveFreebuffSpendCeiling,
} from '../constants/freebuff-spend-ceilings'

describe('region ceilings', () => {
  it('replaces the old flat $50 with a per-region figure', () => {
    expect(resolveFreebuffSpendCeiling({ accessTier: 'full' }).usd).toBe(15)
    expect(resolveFreebuffSpendCeiling({ accessTier: 'limited' }).usd).toBe(5)
  })

  it('keeps the limited region below the full one', () => {
    // A limited-region account cannot reach a premium model, so the same
    // dollars buy far more requests there. An identical cap would not be an
    // identical constraint.
    expect(FREEBUFF_REGION_DAILY_SPEND_USD.limited).toBeLessThan(
      FREEBUFF_REGION_DAILY_SPEND_USD.full,
    )
  })
})

describe('restricted cohorts', () => {
  it('holds a restricted country at the restricted ceiling', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'CN',
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.reason).toBe('restricted_country')
  })

  it('matches the country case-insensitively', () => {
    expect(
      resolveFreebuffSpendCeiling({ accessTier: 'full', countryCode: 'cn' })
        .reason,
    ).toBe('restricted_country')
  })

  it('leaves other countries on the region ceiling', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'US',
    })
    expect(result.usd).toBe(15)
    expect(result.reason).toBe('region')
  })

  it('applies to an anonymizing egress', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      privacyEgress: true,
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.reason).toBe('privacy_egress')
  })

  it('applies to a flagged email domain and to a third-party client', () => {
    expect(
      resolveFreebuffSpendCeiling({
        accessTier: 'full',
        flaggedEmailDomain: true,
      }).reason,
    ).toBe('flagged_email_domain')
    expect(
      resolveFreebuffSpendCeiling({
        accessTier: 'full',
        thirdPartyClient: true,
      }).reason,
    ).toBe('third_party_client')
  })

  it('is half a dollar, and below every region ceiling', () => {
    expect(FREEBUFF_RESTRICTED_DAILY_SPEND_USD).toBe(0.5)
    expect(FREEBUFF_RESTRICTED_DAILY_SPEND_USD).toBeLessThan(
      FREEBUFF_REGION_DAILY_SPEND_USD.limited,
    )
  })

  it('never blocks outright — the restricted ceiling is above zero', () => {
    // A zero ceiling is a block, and a block tells the operator which signal
    // caught them, at which point they rotate it. Keeping them served at a
    // dollar keeps them visible to the sweeps that produce ban-grade evidence.
    expect(FREEBUFF_RESTRICTED_DAILY_SPEND_USD).toBeGreaterThan(0)
  })
})

describe('composition', () => {
  it('takes the minimum, so order of rules cannot change the outcome', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      countryCode: 'SG',
      privacyEgress: true,
      flaggedEmailDomain: true,
      thirdPartyClient: true,
      trustLevelCeilingUsd: 3,
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.applied.length).toBe(6)
  })

  it('can only lower, never raise', () => {
    // The property that makes this safe to ship while the trust rollout is
    // still observing: nothing here can hand anyone a bigger budget.
    const base = resolveFreebuffSpendCeiling({ accessTier: 'full' }).usd
    for (const trustLevelCeilingUsd of [1, 8, 50, 90]) {
      expect(
        resolveFreebuffSpendCeiling({
          accessTier: 'full',
          trustLevelCeilingUsd,
        }).usd,
      ).toBeLessThanOrEqual(base)
    }
  })

  it('ignores a trust ceiling that is not being enforced', () => {
    expect(
      resolveFreebuffSpendCeiling({
        accessTier: 'full',
        trustLevelCeilingUsd: null,
      }).usd,
    ).toBe(15)
  })

  it('resolves a tie to the least accusatory reason', () => {
    // When the region and a restricted cohort agree on the number, "region" is
    // equally true and does not imply we think something about the account.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      flaggedEmailDomain: true,
      overrides: { regionUsd: { limited: 1 }, restrictedUsd: 1 },
    })
    expect(result.usd).toBe(1)
    expect(result.reason).toBe('region')
  })
})

describe('overrides', () => {
  it('lets every ceiling be raised without a deploy', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      countryCode: 'CN',
      overrides: {
        regionUsd: { limited: 40 },
        restrictedUsd: 25,
        restrictedCountries: [],
        elevatedCountries: [],
      },
    })
    expect(result.usd).toBe(40)
    expect(result.reason).toBe('region')
  })

  it('disables the country rule on an empty list', () => {
    expect(
      resolveFreebuffSpendCeiling({
        accessTier: 'full',
        countryCode: 'CN',
        overrides: { restrictedCountries: [] },
      }).reason,
    ).toBe('region')
  })
})

describe('elevated countries', () => {
  it('holds an elevated country between the region and restricted ceilings', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'SG',
    })
    expect(result.usd).toBe(FREEBUFF_ELEVATED_DAILY_SPEND_USD)
    expect(result.reason).toBe('elevated_country')
    expect(result.usd).toBeGreaterThan(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.usd).toBeLessThan(FREEBUFF_REGION_DAILY_SPEND_USD.full)
  })

  it('does not cut a LIVE session — no hard cap, like the region ceilings', () => {
    // The whole point of $5 rather than $0.50 is that it is a budget, not a
    // suspicion. Applying the 2x hard cut here would interrupt an ordinary
    // Singaporean developer mid-thought, which is the error this tier exists
    // to stop making.
    const ceiling = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'SG',
    })
    expect(resolveFreebuffHardSpendCeiling(ceiling)).toBeNull()
  })

  it('still loses to a restricted cohort the account is also in', () => {
    // Composition by minimum has to keep working: an SG account on a VPN is
    // priced by the VPN, not by the softer geography.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'SG',
      privacyEgress: true,
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.reason).toBe('privacy_egress')
  })

  it('resolves a tie with the region ceiling to `region`', () => {
    // A limited-tier account in an elevated country sees $5 from both rules.
    // The tie must land on the reason that implies nothing about the account.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      countryCode: 'SG',
    })
    expect(result.usd).toBe(5)
    expect(result.reason).toBe('region')
  })
})

describe('unverified egress', () => {
  it('prices an unresolved escalation at the restricted ceiling', () => {
    // A provider outage must not be the cheapest way to buy a bigger budget.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      unverifiedEgress: true,
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.reason).toBe('unverified_egress')
  })

  it('applies the hard multiplier, like the other restricted cohorts', () => {
    const ceiling = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      unverifiedEgress: true,
    })
    expect(resolveFreebuffHardSpendCeiling(ceiling, 2)).toBe(1)
  })
})

describe('refusal copy', () => {
  it('gives a plain allowance no abuse framing', () => {
    for (const reason of ['region', 'elevated_country', 'trust_level']) {
      const copy = freebuffSpendNoticeFor(reason)
      expect(copy).toBe(FREEBUFF_BUDGET_NOTICE)
      expect(copy).not.toContain('abuse')
      // The words that turn a cap into a verdict on the person, and the ones
      // support tickets come back quoting.
      expect(copy.toLowerCase()).not.toContain('limited')
      expect(copy.toLowerCase()).not.toContain('restricted')
      expect(copy.toLowerCase()).not.toContain('blocked')
    }
  })

  it('keeps naming the cause SET for the restricted cohorts', () => {
    for (const reason of [
      'privacy_egress',
      'restricted_country',
      'flagged_email_domain',
      'unverified_egress',
    ]) {
      expect(freebuffSpendNoticeFor(reason)).toBe(FREEBUFF_RESTRICTED_NOTICE)
    }
  })

  it('keeps third_party_client cause-blind so the detector stays unnamed', () => {
    expect(freebuffSpendNoticeFor('third_party_client')).toBe(
      FREEBUFF_CAPACITY_NOTICE,
    )
  })

  it('publishes no dollar figure in any refusal', () => {
    // A published cap is a published pacing instruction.
    for (const copy of [
      FREEBUFF_BUDGET_NOTICE,
      FREEBUFF_CAPACITY_NOTICE,
      FREEBUFF_RESTRICTED_NOTICE,
    ]) {
      expect(copy).not.toMatch(/\$|\d/)
    }
  })
})
