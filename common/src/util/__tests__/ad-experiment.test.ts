import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_FIRST_PARTY_BACKFILL,
  firstPartyAdRouteForUser,
  firstPartyAdRouteForGeoRequest,
  houseLegOpen,
  houseSubscriptionBillingArmForUser,
  parseHouseSubscriptionBillingExperimentMode,
} from '../ad-experiment'

describe('house subscription billing experiment', () => {
  test('defaults unknown and absent modes off', () => {
    for (const value of [undefined, null, '', 'ON', 'shadow']) {
      expect(parseHouseSubscriptionBillingExperimentMode(value)).toBe('off')
    }
    expect(parseHouseSubscriptionBillingExperimentMode('on')).toBe('on')
  })

  test('keeps users sticky and assigns approximately half to each arm', () => {
    const N = 20_000
    let monthly = 0
    for (let index = 0; index < N; index++) {
      const userId = `user-${index}`
      const arm = houseSubscriptionBillingArmForUser(userId)
      expect(houseSubscriptionBillingArmForUser(userId)).toBe(arm)
      if (arm === 'monthly') monthly++
    }
    const monthlyPercent = (monthly / N) * 100
    expect(monthlyPercent).toBeGreaterThan(48.5)
    expect(monthlyPercent).toBeLessThan(51.5)
  })
})

describe('first-party request routing', () => {
  test('keeps an absent runtime configuration on the paid-network-only path', () => {
    expect(DEFAULT_FIRST_PARTY_BACKFILL).toBe(false)
    expect(
      firstPartyAdRouteForUser('user-42', {
        backfill: DEFAULT_FIRST_PARTY_BACKFILL,
      }),
    ).toBe('paid_network_only')
  })

  test('never routes a missing user id into first-party inventory', () => {
    for (const id of [null, undefined, '']) {
      expect(firstPartyAdRouteForUser(id, { backfill: true })).toBe(
        'paid_network_only',
      )
    }
  })

  test('our book only ever follows Gravity', () => {
    for (let i = 0; i < 1_000; i++) {
      const id = `user-${i}`
      expect(firstPartyAdRouteForUser(id, { backfill: false })).toBe(
        'paid_network_only',
      )
      expect(firstPartyAdRouteForUser(id, { backfill: true })).toBe(
        'gravity_then_first_party',
      )
    }
  })

  test('geo routing keeps Tier 1 on the configured backfill policy', () => {
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        { backfill: true, geoRouting: true },
        'tier1',
      ),
    ).toBe('gravity_then_first_party')
  })

  test('Tier 2 and unknown geo stay on paid networks: there is no bonus route', () => {
    const config = { backfill: true, geoRouting: true }
    expect(firstPartyAdRouteForGeoRequest('user', config, 'tier2')).toBe(
      'paid_network_only',
    )
    expect(firstPartyAdRouteForGeoRequest('user', config, 'unknown')).toBe(
      'paid_network_only',
    )
  })

  test('geo gate off preserves the legacy global policy', () => {
    expect(
      firstPartyAdRouteForGeoRequest(
        'user',
        { backfill: true, geoRouting: false },
        'unknown',
      ),
    ).toBe('gravity_then_first_party')
  })
})

describe('the house leg (COD-358)', () => {
  test('opens on Tier 1 and Tier 2, never on unknown geo, never signed out, never off', () => {
    const on = { houseLeg: true, geoRouting: true }
    expect(houseLegOpen('user', on, 'tier1')).toBe(true)
    expect(houseLegOpen('user', on, 'tier2')).toBe(true)
    expect(houseLegOpen('user', on, 'unknown')).toBe(false)
    expect(houseLegOpen(null, on, 'tier1')).toBe(false)
    expect(houseLegOpen('user', { ...on, houseLeg: false }, 'tier1')).toBe(
      false,
    )
  })

  test('with geo routing off there is no tier and the knob alone decides', () => {
    const off = { houseLeg: true, geoRouting: false }
    expect(houseLegOpen('user', off, 'unknown')).toBe(true)
    expect(houseLegOpen('user', { ...off, houseLeg: false }, 'tier1')).toBe(
      false,
    )
  })
})
