import { describe, expect, it } from 'bun:test'

import { FREEBUFF_SUBSCRIPTION_TIERS } from '../freebuff-subscriptions'

/**
 * The intro price a client DISPLAYS and the discount Stripe CHARGES are two
 * separate configurations — the number in the catalog, and a coupon id in
 * `FREEBUFF_SUBSCRIPTION_INTRO_COUPON_IDS`. Nothing at runtime reconciles
 * them: a tier whose `introPriceUsd` says $19 while its coupon is worth $3
 * advertises one price and bills another, silently, on live cards.
 *
 * This cannot reach into Stripe, so it does the next best thing — it pins each
 * tier's discount to the coupon id that discount REQUIRES, by the convention
 * the ids follow (`freebuff_intro_<tier>_<cents>c`). Editing a price without
 * minting the matching coupon fails here, and the failure names the coupon to
 * create.
 */
describe('intro pricing ↔ Stripe coupon ids', () => {
  it('requires the coupon each tier discount is named after', () => {
    const required = FREEBUFF_SUBSCRIPTION_TIERS.map((tier) => {
      const offCents = Math.round((tier.priceUsd - tier.introPriceUsd) * 100)
      return `${tier.id}=freebuff_intro_${tier.id}_${offCents}c`
    })
    // Live in prod as of 2026-09-03: $3 / $6 / $15 off, proportional to tier.
    expect(required).toEqual([
      'starter=freebuff_intro_starter_300c',
      'plus=freebuff_intro_plus_600c',
      'pro=freebuff_intro_pro_1500c',
    ])
  })

  // A discount that reaches or passes the price would make the first period
  // free (or negative), which Stripe accepts and the copy would not survive.
  it('keeps every intro price a real, positive first charge', () => {
    for (const tier of FREEBUFF_SUBSCRIPTION_TIERS) {
      expect(tier.introPriceUsd).toBeGreaterThan(0)
      expect(tier.introPriceUsd).toBeLessThan(tier.priceUsd)
    }
  })
})
