import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
} from './freebuff-model-ids'
import {
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_KIMI_K3_ECO_MODEL_ID,
} from './freebuff-models'

/**
 * Paid Freebuff subscription tiers.
 *
 * **One subscription per account, not per model.** A tier grants a single
 * pooled session allowance that every subscribable model draws from, so a user
 * picks a plan rather than assembling one. Upgrading swaps the tier on the same
 * subscription; there is exactly one row per user either way.
 *
 * **This file is published.** `common` ships wholesale to the public mirror
 * (docs/public-repo-sync.md), so everything here is world-readable — limits and
 * prices are product facts we would put on a pricing page anyway. Stripe price
 * ids are deliberately NOT here; they live in server env keyed by tier id, so
 * the catalog can be read by a client without handing anyone the objects that
 * mint a checkout.
 */

/** Models a subscription's pooled allowance can be spent on. */
export const FREEBUFF_SUBSCRIPTION_MODEL_IDS: readonly string[] = Object.freeze([
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_KIMI_K3_ECO_MODEL_ID,
])

/**
 * The expensive half of the pool, sub-capped within each day.
 *
 * Measured 2026-08-21: Luna $[redacted] and DeepSeek V4 Pro $[redacted] per hour-session,
 * against Flash at $[redacted] — roughly 4-5x. Without a sub-cap a subscriber
 * spending every daily session on Luna costs 5x one spending them on Flash, at
 * the same price, so the daily allowance would have to be priced for the worst
 * case and would be small for everyone.
 *
 * Kimi K3 Eco is deliberately NOT here. It is currently `GOD_ONLY_BAIT_MODEL_ID`
 * (web/src/llm-api/honeypot-models.ts) reached mostly by API probers, so its
 * measured cost describes short aborted sessions rather than real use and
 * cannot be priced against. Revisit once it carries genuine client traffic.
 */
export const FREEBUFF_SUBSCRIPTION_PREMIUM_MODEL_IDS: readonly string[] =
  Object.freeze([
    FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  ])

export function isFreebuffSubscriptionPremiumModelId(modelId: string): boolean {
  return FREEBUFF_SUBSCRIPTION_PREMIUM_MODEL_IDS.includes(modelId)
}

export function isFreebuffSubscriptionModelId(modelId: string): boolean {
  return FREEBUFF_SUBSCRIPTION_MODEL_IDS.includes(modelId)
}

/** Tier identifiers. Ordered: a higher index is a strictly larger plan. */
export const FREEBUFF_SUBSCRIPTION_TIER_IDS = [
  'starter',
  'plus',
  'pro',
] as const
export type FreebuffSubscriptionTierId =
  (typeof FREEBUFF_SUBSCRIPTION_TIER_IDS)[number]

export interface FreebuffSubscriptionTier {
  id: FreebuffSubscriptionTierId
  displayName: string
  /** Every period after the first, in USD. */
  priceUsd: number
  /**
   * First billing period, in USD — the promotional price for STARTING on this
   * tier.
   *
   * Per tier, not one global discount: the offer that gets someone onto
   * Starter is not the offer that gets them onto Plus, and a flat amount off
   * would be a trivial discount at $60 and most of the price at $8.
   *
   * Charged at most once per ACCOUNT. Whichever tier a user starts on consumes
   * it, so upgrading later pays full price — which is why `intro_used` lives
   * on the user's single subscription row rather than per tier.
   */
  introPriceUsd: number
  /** Pooled sessions per Pacific day. One session is one hour. */
  dailySessions: number
  /**
   * Pooled sessions per rolling 5-day window.
   *
   * Sits between the daily and monthly caps so one intense week cannot eat the
   * month. Rolling rather than a fixed period: a fixed one has a reset cliff
   * that rewards waiting for it, and the counting query is identical either way.
   */
  fiveDaySessions: number
  /** Pooled sessions per billing period. The cost ceiling. */
  monthlySessions: number
  /**
   * How many of the DAILY sessions may be spent on premium models
   * (Luna / DeepSeek V4 Pro). The rest must go to the cheaper pool.
   */
  dailyPremiumSessions: number
  /**
   * Whether DeepSeek models are withheld during their double-priced peak
   * windows (common/constants/freebuff-peak-hours.ts). Surfaced to clients as
   * a disclaimer on the plan.
   */
  deepseekPeakHoursExcluded: boolean
}

export const FREEBUFF_SUBSCRIPTION_TIERS: readonly FreebuffSubscriptionTier[] =
  Object.freeze([
    {
      id: 'starter',
      displayName: 'Starter',
      priceUsd: 8,
      introPriceUsd: 2.5,
      dailySessions: 4,
      fiveDaySessions: 12,
      monthlySessions: 50,
      dailyPremiumSessions: 2,
      deepseekPeakHoursExcluded: true,
    },
    {
      id: 'plus',
      displayName: 'Plus',
      priceUsd: 25,
      introPriceUsd: 12,
      dailySessions: 12,
      fiveDaySessions: 40,
      monthlySessions: 150,
      dailyPremiumSessions: 7,
      deepseekPeakHoursExcluded: true,
    },
    {
      // Limits here are DERIVED, not specified: they scale the Plus tier by the
      // price ratio (2.4x) and then round, and were checked against the same
      // "max monthly cost <= 6x price" policy the other two satisfy —
      // 360 sessions x $[redacted] worst-case = $273, i.e. 4.6x. Change them freely;
      // re-run scripts/analyze-freebuff-subscription-limits.ts afterwards.
      id: 'pro',
      displayName: 'Pro',
      priceUsd: 60,
      // DERIVED, not specified: the same ~50% off the first month that Plus
      // gets ($12 of $25). Change it freely — it only affects what someone
      // pays to START on Pro, which is rare, since most accounts consume their
      // one intro on a lower tier first.
      introPriceUsd: 30,
      dailySessions: 25,
      fiveDaySessions: 80,
      monthlySessions: 360,
      dailyPremiumSessions: 15,
      deepseekPeakHoursExcluded: false,
    },
  ] satisfies FreebuffSubscriptionTier[])

const TIERS_BY_ID = new Map(FREEBUFF_SUBSCRIPTION_TIERS.map((t) => [t.id, t]))

export function freebuffSubscriptionTier(
  id: string | null | undefined,
): FreebuffSubscriptionTier | undefined {
  return id ? TIERS_BY_ID.get(id as FreebuffSubscriptionTierId) : undefined
}

/** The next tier up, or undefined at the top. Drives every upgrade CTA. */
export function nextFreebuffSubscriptionTier(
  id: string | null | undefined,
): FreebuffSubscriptionTier | undefined {
  if (!id) return FREEBUFF_SUBSCRIPTION_TIERS[0]
  const index = FREEBUFF_SUBSCRIPTION_TIERS.findIndex((t) => t.id === id)
  return index === -1 ? undefined : FREEBUFF_SUBSCRIPTION_TIERS[index + 1]
}

/** Rank for comparing tiers. -1 when unknown, so callers can treat it as none. */
export function freebuffSubscriptionTierRank(id: string | null | undefined) {
  return FREEBUFF_SUBSCRIPTION_TIERS.findIndex((t) => t.id === id)
}

/**
 * Human-readable constraints for a tier, for the plan card and the paywall.
 *
 * Built here rather than in each client so the CLI, the Web dropdown and the
 * settings page cannot describe the same plan three different ways.
 */
export function freebuffSubscriptionTierDisclaimers(
  tier: FreebuffSubscriptionTier,
): string[] {
  const out = [
    `${tier.dailyPremiumSessions} of your ${tier.dailySessions} daily sessions can be GPT 5.6 Luna or DeepSeek V4 Pro`,
    `${tier.fiveDaySessions} sessions per rolling 5 days, ${tier.monthlySessions} per month`,
  ]
  if (tier.deepseekPeakHoursExcluded) {
    out.push('DeepSeek models are unavailable during peak hours')
  }
  return out
}

/**
 * Subscription period reset zone. Deliberately the same Pacific day boundary
 * the free pools reset on: a subscriber must not see two different "resets at"
 * times in one picker.
 */
export const FREEBUFF_SUBSCRIPTION_RESET_TIMEZONE = 'America/Los_Angeles'

/** Length of the rolling mid-window, in days. */
export const FREEBUFF_SUBSCRIPTION_FIVE_DAY_WINDOW_DAYS = 5
