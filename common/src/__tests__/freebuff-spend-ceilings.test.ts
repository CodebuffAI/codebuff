import { describe, expect, it } from 'bun:test'

import {
  FREEBUFF_BUDGET_NOTICE,
  FREEBUFF_BUDGET_NOTICE_REASONS,
  FREEBUFF_CAPACITY_NOTICE,
  FREEBUFF_FREEBUCKS_CEILING_NOTICE,
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

describe('on the Freebucks meter', () => {
  // The plan ceiling is the budget; the session-era budget cohorts sat under
  // it and refused accounts with Freebucks in hand (SG, 2026-09-05).
  it('the plan ceiling replaces the elevated-country and trust-level budgets', () => {
    const elevated = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'SG',
      freebucksPlanUsd: 3,
    })
    expect(elevated.reason).toBe('freebucks_plan')
    expect(elevated.usd).toBe(3)
    const trusted = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      trustLevelCeilingUsd: 0.5,
      freebucksPlanUsd: 3,
    })
    expect(trusted.reason).toBe('freebucks_plan')
    expect(trusted.usd).toBe(3)
  })

  it('the abuse cohorts still compose under the plan ceiling', () => {
    const egress = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      privacyEgress: true,
      freebucksPlanUsd: 3,
    })
    expect(egress.reason).toBe('privacy_egress')
    expect(egress.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
  })

  it('off the meter nothing changes', () => {
    const result = resolveFreebuffSpendCeiling({ accessTier: 'full', countryCode: 'SG' })
    expect(result.reason).toBe('elevated_country')
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

  it('cuts a LIVE session only past the leeway multiplier', () => {
    // Reversed 2026-08-31 when the elevated ceiling dropped $5 → $1: at one
    // dollar, overshoot is no longer proportionally small, and the multiplier
    // is what grants an open session leeway to finish before the hard cut.
    const ceiling = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      countryCode: 'SG',
    })
    expect(ceiling.usd).toBe(FREEBUFF_ELEVATED_DAILY_SPEND_USD)
    expect(resolveFreebuffHardSpendCeiling(ceiling, 1.25)).toBeCloseTo(
      FREEBUFF_ELEVATED_DAILY_SPEND_USD * 1.25,
    )
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
    // The defaults no longer tie ($1 elevated vs $5 limited region), so the
    // tie is constructed with overrides — the RULE still has to hold: a tie
    // lands on the reason that implies nothing about the account.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      countryCode: 'SG',
      overrides: { elevatedUsd: 5 },
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
      // The whole point of naming the cause is that it carries an ACTION. A
      // user throttled for VPN egress who is only told they ran out has no way
      // to know that connecting directly restores the allowance -- which is
      // exactly what was happening on the rate-limit path until 2026-08-24.
      expect(FREEBUFF_RESTRICTED_NOTICE).toContain('VPN')
      expect(FREEBUFF_RESTRICTED_NOTICE).toContain('connecting directly')
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

describe('paid-plan daily floors (2026-08-31)', () => {
  // The cohort ceilings were sized for free usage; 11 live subscribers were
  // spend-refused in the 48h before this shipped, three of them at thirty
  // cents a day against an $8/month plan. A floor, not an exemption: the
  // plan's monthly spend cap remains the money bound.
  it('floors a limited-region subscriber at $3 when the region ceiling dips below', () => {
    // The code-default limited region ($5) already exceeds the $3 floor; the
    // floor binds when env tuning takes the region lower — as prod does.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      hasPaidSubscription: true,
      overrides: { regionUsd: { limited: 1 } },
    })
    expect(result.usd).toBe(3)
    expect(result.reason).toBe('region')
  })

  it('floors a full-region subscriber at $7', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      hasPaidSubscription: true,
      overrides: { regionUsd: { full: 5 } },
    })
    expect(result.usd).toBe(7)
  })

  it('floors the restricted cohorts too — a card is the realness signal', () => {
    for (const input of [
      { privacyEgress: true },
      { countryCode: 'CN' },
      { flaggedEmailDomain: true },
      { unverifiedEgress: true },
    ]) {
      const result = resolveFreebuffSpendCeiling({
        accessTier: 'limited',
        hasPaidSubscription: true,
        ...input,
      })
      expect(result.usd).toBe(3)
    }
  })

  it('never LOWERS a ceiling that already exceeds the floor', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      hasPaidSubscription: true,
    })
    // Region default $15 > the $7 floor: the higher number survives.
    expect(result.usd).toBe(FREEBUFF_REGION_DAILY_SPEND_USD.full)
    expect(result.reason).toBe('region')
  })

  it('does NOT floor third_party_client — the reseller cohort', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      thirdPartyClient: true,
      hasPaidSubscription: true,
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.reason).toBe('third_party_client')
  })

  it('keeps naming the floored cohort as the reason', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      countryCode: 'CN',
      hasPaidSubscription: true,
    })
    expect(result.usd).toBe(3)
    expect(result.reason).toBe('restricted_country')
  })

  it('a free account is untouched by the floor machinery', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      countryCode: 'CN',
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
  })
})

describe('the Freebucks meter ceiling (2026-09-02)', () => {
  it('replaces the region ceiling rather than composing with it', () => {
    // A limited Pro subscriber's advertised $7 must not be undercut by the
    // $5 limited-region ceiling: the catalog figure takes the region's place.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'limited',
      freebucksPlanUsd: 7,
    })
    expect(result.usd).toBe(7)
    expect(result.reason).toBe('freebucks_plan')
    expect(result.applied.some((a) => a.reason === 'region')).toBe(false)
  })

  it('is the base entry the restricted cohorts still compose under', () => {
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      freebucksPlanUsd: 3,
      privacyEgress: true,
    })
    expect(result.usd).toBe(FREEBUFF_RESTRICTED_DAILY_SPEND_USD)
    expect(result.reason).toBe('privacy_egress')
  })

  it('is never raised by the paid floor', () => {
    // The catalog already priced the paid tiers; a floor lifting a Starter's
    // $3 to $7 would undo the one number the tier sets.
    const result = resolveFreebuffSpendCeiling({
      accessTier: 'full',
      freebucksPlanUsd: 3,
      hasPaidSubscription: true,
    })
    expect(result.usd).toBe(3)
  })

  it('is hard-capped, so a live session gets the leeway multiplier then the cut', () => {
    expect(
      resolveFreebuffHardSpendCeiling({ usd: 1.5, reason: 'freebucks_plan' }),
    ).toBe(3)
  })

  it('carries its own refusal copy and stays out of the plan bypass set', () => {
    expect(freebuffSpendNoticeFor('freebucks_plan')).toBe(
      FREEBUFF_FREEBUCKS_CEILING_NOTICE,
    )
    expect(freebuffSpendNoticeFor('freebucks_plan')).not.toBe(
      FREEBUFF_BUDGET_NOTICE,
    )
    expect(FREEBUFF_BUDGET_NOTICE_REASONS.has('freebucks_plan')).toBe(false)
  })

  it('changes nothing when absent', () => {
    expect(resolveFreebuffSpendCeiling({ accessTier: 'full' })).toEqual(
      resolveFreebuffSpendCeiling({
        accessTier: 'full',
        freebucksPlanUsd: null,
      }),
    )
  })
})
