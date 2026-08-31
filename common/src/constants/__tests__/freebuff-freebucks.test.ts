import { describe, expect, it } from 'bun:test'

import {
  FREEBUCKS_FREE_ALLOWANCE,
  FREEBUCKS_PLAN_ALLOWANCE,
  FREEBUCKS_PURCHASABLE_MODEL_IDS,
  FREEBUCKS_SESSION_PRICES,
  freebucksBlockingWindow,
  freebucksSessionPrice,
  freebucksTotalAllowance,
  isFreebucksPurchasableModelId,
} from '../freebuff-freebucks'

describe('Freebucks allowances', () => {
  // The whole cost control. If a window ever becomes additive, a daily grant
  // silently becomes a monthly one for exactly the heaviest accounts — which
  // is the failure this test exists to prevent, not a style rule.
  it('keeps every allowance sub-additive across windows', () => {
    const all = [
      ...Object.values(FREEBUCKS_FREE_ALLOWANCE),
      ...Object.values(FREEBUCKS_PLAN_ALLOWANCE),
    ]
    expect(all.length).toBeGreaterThan(0)
    for (const a of all) {
      expect(a.weekly).toBeLessThan(a.daily * 7)
      expect(a.monthly).toBeLessThan(a.daily * 30)
      // A week must still be worth more than a day, or the week cap is the
      // only one that ever binds and the daily figure is decorative.
      expect(a.weekly).toBeGreaterThan(a.daily)
      expect(a.monthly).toBeGreaterThan(a.weekly)
    }
  })

  // The lower weekly bound, which is the easy one to break silently: set the
  // week too tight and the advertised monthly total can never be reached, so
  // the plan promises a number it will not honour.
  it('keeps every monthly total reachable within its weekly cap', () => {
    const WEEKS_PER_MONTH = 30 / 7
    for (const [name, a] of Object.entries(FREEBUCKS_PLAN_ALLOWANCE)) {
      expect(
        a.weekly * WEEKS_PER_MONTH,
        `${name}: weekly cap binds before the monthly total is reachable`,
      ).toBeGreaterThanOrEqual(a.monthly)
    }
  })

  it('gives the limited tier less than full access', () => {
    expect(FREEBUCKS_FREE_ALLOWANCE.limited.daily).toBeLessThan(
      FREEBUCKS_FREE_ALLOWANCE.full.daily,
    )
  })

  it('stacks the plan on top of the free grant rather than replacing it', () => {
    const free = freebucksTotalAllowance({ accessTier: 'full' })
    const paid = freebucksTotalAllowance({
      accessTier: 'full',
      tierId: 'starter',
    })
    expect(free.daily).toBe(FREEBUCKS_FREE_ALLOWANCE.full.daily)
    expect(paid.daily).toBe(
      FREEBUCKS_FREE_ALLOWANCE.full.daily + FREEBUCKS_PLAN_ALLOWANCE.starter.daily,
    )
  })

  it('ignores an unknown tier instead of dropping the free grant', () => {
    const a = freebucksTotalAllowance({
      accessTier: 'full',
      tierId: 'no-such-tier',
    })
    expect(a).toEqual(freebucksTotalAllowance({ accessTier: 'full' }))
  })

  it('keeps Plus at 2.5x Starter on the day and week windows', () => {
    const { starter, plus } = FREEBUCKS_PLAN_ALLOWANCE
    expect(plus.daily / starter.daily).toBeCloseTo(2.5, 5)
    expect(plus.weekly / starter.weekly).toBeCloseTo(2.5, 5)
  })

  // The month is deliberately MORE generous than the headline ratio — it is
  // the window a heavy user lives in. Asserted as a floor so the extra stays a
  // choice; an equality here would forbid the choice, and dropping the
  // assertion entirely would let the month silently fall behind the week.
  it('never makes the Plus month worth less than 2.5x Starter', () => {
    const { starter, plus } = FREEBUCKS_PLAN_ALLOWANCE
    expect(plus.monthly / starter.monthly).toBeGreaterThanOrEqual(2.5)
  })

  // The free daily grant has to buy at least one of SOMETHING, or the currency
  // is visible to every free user and spendable by none of them.
  it('affords the cheapest premium session on the free daily grant', () => {
    const cheapest = Math.min(...Object.values(FREEBUCKS_SESSION_PRICES))
    expect(FREEBUCKS_FREE_ALLOWANCE.full.daily).toBeGreaterThanOrEqual(cheapest)
    expect(FREEBUCKS_FREE_ALLOWANCE.limited.daily).toBeGreaterThanOrEqual(
      cheapest,
    )
  })
})

describe('Freebucks prices', () => {
  it('treats the price map as the purchasable allowlist', () => {
    expect(isFreebucksPurchasableModelId('z-ai/glm-5.3-flash')).toBe(true)
    // In the free pools, never sold.
    expect(isFreebucksPurchasableModelId('mimo/mimo-v2.5')).toBe(false)
    expect(freebucksSessionPrice('mimo/mimo-v2.5')).toBeUndefined()
  })

  it('prices every purchasable model as a positive whole number', () => {
    expect(FREEBUCKS_PURCHASABLE_MODEL_IDS.length).toBe(
      Object.keys(FREEBUCKS_SESSION_PRICES).length,
    )
    for (const id of FREEBUCKS_PURCHASABLE_MODEL_IDS) {
      const price = freebucksSessionPrice(id)
      expect(price).toBeGreaterThan(0)
      expect(Number.isInteger(price)).toBe(true)
    }
  })

  it('lists purchasable models cheapest first', () => {
    const prices = FREEBUCKS_PURCHASABLE_MODEL_IDS.map(
      (id) => FREEBUCKS_SESSION_PRICES[id],
    )
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })
})

describe('freebucksBlockingWindow', () => {
  it('returns null when every window can absorb the cost', () => {
    expect(
      freebucksBlockingWindow({
        cost: 15,
        remaining: { daily: 20, weekly: 40, monthly: 100 },
      }),
    ).toBeNull()
  })

  // Daily first, so the message names the window that reopens soonest.
  it('names the soonest-reopening window when several are short', () => {
    expect(
      freebucksBlockingWindow({
        cost: 25,
        remaining: { daily: 10, weekly: 10, monthly: 10 },
      }),
    ).toBe('daily')
  })

  it('reports a weekly block when only the week is short', () => {
    expect(
      freebucksBlockingWindow({
        cost: 25,
        remaining: { daily: 40, weekly: 10, monthly: 100 },
      }),
    ).toBe('weekly')
  })

  it('treats an exactly-affordable cost as affordable', () => {
    expect(
      freebucksBlockingWindow({
        cost: 20,
        remaining: { daily: 20, weekly: 20, monthly: 20 },
      }),
    ).toBeNull()
  })
})
