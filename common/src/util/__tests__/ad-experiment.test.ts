import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_FIRST_PARTY_BACKFILL,
  DEFAULT_FIRST_PARTY_PRIMARY_PERCENT,
  IMPREZIA_EXPERIMENT_PERCENT,
  adExperimentArmForUser,
  firstPartyAdRouteForUser,
  firstPartyAdRouteForGeoRequest,
  firstPartyPrimaryBucket,
  firstPartyPrimaryBasisPoints,
  isImpreziaAudienceEmail,
} from '../ad-experiment'

describe('imprezia experiment arm', () => {
  test('signed-out sessions stay in control', () => {
    for (const id of [null, undefined, '']) {
      expect(adExperimentArmForUser(id)).toBe('control')
    }
  })

  test('a user gets the same arm every time', () => {
    for (const id of ['abc', 'user-42', 'a-very-long-uuid-like-identifier']) {
      const first = adExperimentArmForUser(id)
      for (let i = 0; i < 20; i++) {
        expect(adExperimentArmForUser(id)).toBe(first)
      }
    }
  })

  test(`puts ~${IMPREZIA_EXPERIMENT_PERCENT}% of users in the arm`, () => {
    const N = 20_000
    let inArm = 0
    for (let i = 0; i < N; i++) {
      if (adExperimentArmForUser(`user-${i}`) === 'imprezia_first') inArm++
    }
    const percent = (inArm / N) * 100
    // FNV-1a over sequential ids is not a perfect uniform source, so allow a
    // point of slack rather than asserting an exact count.
    expect(percent).toBeGreaterThan(IMPREZIA_EXPERIMENT_PERCENT - 1.5)
    expect(percent).toBeLessThan(IMPREZIA_EXPERIMENT_PERCENT + 1.5)
  })

  test('forces only the Imprezia domain and named test account', () => {
    for (const email of ['dev@Imprezia.AI', 'jahooma@gmail.com']) {
      expect(isImpreziaAudienceEmail(email)).toBe(true)
      expect(adExperimentArmForUser('user', email)).toBe('imprezia_forced')
    }
    for (const email of [
      'dev@imprezia.ai.evil.com',
      'jahooma+test@gmail.com',
    ]) {
      expect(isImpreziaAudienceEmail(email)).toBe(false)
    }
  })
})

describe('first-party request routing', () => {
  test('normalizes decimal percentages to the same integer basis points used by campaign allocation', () => {
    expect(firstPartyPrimaryBasisPoints(1.234)).toBe(123)
    expect(firstPartyPrimaryBasisPoints(-1)).toBe(0)
    expect(firstPartyPrimaryBasisPoints(101)).toBe(10_000)
    expect(firstPartyPrimaryBasisPoints(Number.NaN)).toBe(0)
  })

  test('keeps an absent runtime configuration on the paid-network-only path', () => {
    expect(DEFAULT_FIRST_PARTY_PRIMARY_PERCENT).toBe(0)
    expect(DEFAULT_FIRST_PARTY_BACKFILL).toBe(false)
    expect(
      firstPartyAdRouteForUser('user-42', {
        primaryPercent: DEFAULT_FIRST_PARTY_PRIMARY_PERCENT,
        backfill: DEFAULT_FIRST_PARTY_BACKFILL,
      }),
    ).toBe('paid_network_only')
  })

  test('never routes a missing user id into first-party inventory', () => {
    for (const id of [null, undefined, '']) {
      expect(
        firstPartyAdRouteForUser(id, {
          primaryPercent: 100,
          backfill: true,
        }),
      ).toBe('paid_network_only')
    }
  })

  test('keeps legacy callers stable when no request sample is supplied', () => {
    for (const id of ['abc', 'user-42', 'another-user']) {
      const config = { primaryPercent: 37.5, backfill: true }
      const first = firstPartyAdRouteForUser(id, config)
      for (let i = 0; i < 20; i++) {
        expect(firstPartyAdRouteForUser(id, config)).toBe(first)
      }
    }
  })

  test('rotates the same user across independently sampled requests', () => {
    const routes = new Set(
      Array.from({ length: 10_000 }, (_, index) =>
        firstPartyAdRouteForUser(
          'same-user',
          { primaryPercent: 1, backfill: false },
          `request-${index}`,
        ),
      ),
    )
    expect(routes).toEqual(
      new Set<ReturnType<typeof firstPartyAdRouteForUser>>([
        'first_party_primary',
        'paid_network_only',
      ]),
    )
  })

  test('routes a sampled request from the same bucket used by campaign allocation', () => {
    for (let index = 0; index < 10_000; index++) {
      const sampleId = `shared-sample-${index}`
      const expected =
        firstPartyPrimaryBucket(sampleId) < 200
          ? 'first_party_primary'
          : 'paid_network_only'
      expect(
        firstPartyAdRouteForUser(
          'user',
          { primaryPercent: 2, backfill: false },
          sampleId,
        ),
      ).toBe(expected)
    }
  })

  test('makes the 0 and 100 percent settings exact', () => {
    for (let i = 0; i < 1_000; i++) {
      const id = `user-${i}`
      expect(
        firstPartyAdRouteForUser(id, {
          primaryPercent: 0,
          backfill: false,
        }),
      ).toBe('paid_network_only')
      expect(
        firstPartyAdRouteForUser(id, {
          primaryPercent: 0,
          backfill: true,
        }),
      ).toBe('gravity_then_first_party')
      expect(
        firstPartyAdRouteForUser(id, {
          primaryPercent: 100,
          backfill: false,
        }),
      ).toBe('first_party_primary')
    }
  })

  test(`allocates about ${DEFAULT_FIRST_PARTY_PRIMARY_PERCENT}% of users by default`, () => {
    const N = 20_000
    let allocated = 0
    for (let i = 0; i < N; i++) {
      if (
        firstPartyAdRouteForUser(`user-${i}`, {
          primaryPercent: DEFAULT_FIRST_PARTY_PRIMARY_PERCENT,
          backfill: true,
        }) === 'first_party_primary'
      ) {
        allocated++
      }
    }
    const percent = (allocated / N) * 100
    expect(percent).toBeGreaterThan(DEFAULT_FIRST_PARTY_PRIMARY_PERCENT - 1.5)
    expect(percent).toBeLessThan(DEFAULT_FIRST_PARTY_PRIMARY_PERCENT + 1.5)
  })

  test('expands the same request sample when the primary percentage increases', () => {
    for (let i = 0; i < 10_000; i++) {
      const id = `user-${i}`
      const atTen = firstPartyAdRouteForUser(id, {
        primaryPercent: 10,
        backfill: false,
      })
      const atTwenty = firstPartyAdRouteForUser(id, {
        primaryPercent: 20,
        backfill: false,
      })
      if (atTen === 'first_party_primary') {
        expect(atTwenty).toBe('first_party_primary')
      }
    }
  })

  test('geo routing keeps Tier 1 on the configured primary/backfill policy', () => {
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        {
          primaryPercent: 100,
          backfill: true,
          geoRouting: true,
          tier2BonusPercent: 100,
        },
        { geoTier: 'tier1', terminalPaidFallback: false },
        'sample',
      ),
    ).toBe('first_party_primary')
  })

  test('Tier 2 bonus inventory waits for terminal paid no-fill and unknown geo fails closed', () => {
    const config = {
      primaryPercent: 100,
      backfill: true,
      geoRouting: true,
      tier2BonusPercent: 100,
    }
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        config,
        { geoTier: 'tier2', terminalPaidFallback: false },
        'sample',
      ),
    ).toBe('paid_network_only')
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        config,
        { geoTier: 'tier2', terminalPaidFallback: true },
        'sample',
      ),
    ).toBe('paid_networks_then_first_party_bonus')
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        config,
        { geoTier: 'unknown', terminalPaidFallback: true },
        'sample',
      ),
    ).toBe('paid_network_only')
  })

  test('geo gate off preserves the legacy global policy', () => {
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        {
          primaryPercent: 0,
          backfill: true,
          geoRouting: false,
          tier2BonusPercent: 100,
        },
        { geoTier: 'unknown', terminalPaidFallback: false },
        'sample',
      ),
    ).toBe('gravity_then_first_party')
  })
})
