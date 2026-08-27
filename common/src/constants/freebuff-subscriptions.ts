import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from './freebuff-model-ids'
import {
  FREEBUFF_GLM_V53_FLASH_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_KIMI_K3_ECO_MODEL_ID,
  getFreebuffWebModel,
} from './freebuff-models'
import {
  formatDeepSeekExpensiveWindowLocal,
  formatDeepSeekOffPeakWindowLocal,
  isDeepSeekExpensiveWindow,
} from './freebuff-peak-hours'

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
// DeepSeek V4 Pro left this set on 2026-08-26 with its withdrawal from free
// mode (FREEBUFF_PAUSED_FREE_MODEL_IDS). A subscribable model has to be a model
// admission will actually open a session on, or the plan sells a row whose
// first send fails; GLM 5.3 Flash takes its place in the same slot.
export const FREEBUFF_SUBSCRIPTION_MODEL_IDS: readonly string[] = Object.freeze(
  [
    FREEBUFF_GLM_V53_FLASH_MODEL_ID,
    FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    FREEBUFF_KIMI_K3_ECO_MODEL_ID,
  ],
)

/**
 * The expensive half of the pool, sub-capped within each day.
 *
 * Measured 2026-08-21: Luna $[redacted] and DeepSeek V4 Pro $[redacted] per hour-session,
 * against Flash at $[redacted] — roughly 4-5x. Without a sub-cap a subscriber
 * spending every daily session on Luna costs 5x one spending them on Flash, at
 * the same price, so the daily allowance would have to be priced for the worst
 * case and would be small for everyone.
 *
 * Kimi K3 Eco is deliberately NOT here. It is one of the god-only models in
 * `GOD_ONLY_BAIT_MODEL_IDS` (web/src/llm-api/honeypot-models.ts) reached
 * mostly by API probers, so its measured cost describes short aborted
 * sessions rather than real use and cannot be priced against. Revisit once it
 * carries genuine client traffic.
 */
export const FREEBUFF_SUBSCRIPTION_PREMIUM_MODEL_IDS: readonly string[] =
  Object.freeze([
    // GLM 5.3 Flash is here in V4 Pro's place, and NOT on Pro's argument. It is
    // cheaper per token than every other model in the pool, so the 4-5x
    // measurement above does not describe it. It is here because it is the free
    // catalog's capped row (FREEBUFF_PER_MODEL_SESSION_CAPS) while its cost at
    // fleet scale is still being measured, and a plan that let a subscriber
    // spend an entire day's allowance on the one row we have not finished
    // pricing would be the only way to reach that scale by surprise. Revisit
    // together with the free cap — they answer the same open question.
    FREEBUFF_GLM_V53_FLASH_MODEL_ID,
    FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  ])

export function isFreebuffSubscriptionPremiumModelId(modelId: string): boolean {
  return FREEBUFF_SUBSCRIPTION_PREMIUM_MODEL_IDS.includes(modelId)
}

/**
 * The DeepSeek models a plan's peak-hours pause applies to.
 *
 * Named explicitly rather than matched on an id prefix: a prefix would sweep in
 * any future `deepseek/*` id automatically, and silently pausing a model nobody
 * decided to pause is the kind of change that should require an edit here.
 */
export const FREEBUFF_SUBSCRIPTION_PEAK_PAUSED_MODEL_IDS: readonly string[] =
  Object.freeze([FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID])

export function isFreebuffSubscriptionPeakPausedModelId(
  modelId: string,
): boolean {
  return FREEBUFF_SUBSCRIPTION_PEAK_PAUSED_MODEL_IDS.includes(modelId)
}

export function isFreebuffSubscriptionModelId(modelId: string): boolean {
  return FREEBUFF_SUBSCRIPTION_MODEL_IDS.includes(modelId)
}

/** Tier identifiers. Ordered: a higher index is a strictly larger plan. */
export const FREEBUFF_SUBSCRIPTION_TIER_IDS = [
  'starter',
  'plus',
  // 'pro' ($60) is withheld for now. Its Stripe price still exists but is
  // unreachable, because checkout validates the requested tier against THIS
  // catalog — so restoring it is an edit here, not another live-Stripe write.
] as const
export type FreebuffSubscriptionTierId =
  (typeof FREEBUFF_SUBSCRIPTION_TIER_IDS)[number]

export interface FreebuffSubscriptionTier {
  id: FreebuffSubscriptionTierId
  displayName: string
  /** Every period after the first, in USD. */
  priceUsd: number
  /**
   * First billing period, in USD.
   *
   * A flat **$3 off the first month** on every tier — a nudge, not a deep
   * promotional price. The earlier $2.50/$12 intros discounted most of the
   * entry price, which anchored the product at the discount rather than at
   * $8/mo; $3 off reads as a welcome, and the recurring price stays the story.
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
  /** Pooled sessions per billing period. */
  monthlySessions: number
  /**
   * Provider-spend ceiling per billing period, in USD.
   *
   * The session caps bound COUNT; this bounds COST, and it exists because the
   * two diverge badly — sessions differ ~5x in provider price by model, so a
   * month of maxed Luna sessions costs several times a month of Flash. When
   * period spend reaches this, plan sessions pause for the rest of the period
   * (free sessions keep working), the same fallback shape as the peak-hours
   * pause. Advertised on the pricing write-up as subject to change.
   */
  monthlySpendLimitUsd: number
  /**
   * How many of the DAILY sessions may be spent on premium models
   * (Luna / GLM 5.3 Flash). The rest must go to the cheaper pool.
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
      introPriceUsd: 5,
      dailySessions: 4,
      fiveDaySessions: 12,
      monthlySessions: 50,
      monthlySpendLimitUsd: 40,
      // Equal to dailySessions: the Luna/Pro sub-cap was LIFTED (2026-08-26).
      // Kept as a field rather than deleted so the wire shape and the
      // enforcement stay in place — set it lower again to reinstate the cap
      // without touching code.
      dailyPremiumSessions: 4,
      deepseekPeakHoursExcluded: true,
    },
    {
      id: 'plus',
      displayName: 'Plus',
      priceUsd: 25,
      introPriceUsd: 22,
      dailySessions: 12,
      fiveDaySessions: 40,
      monthlySessions: 150,
      monthlySpendLimitUsd: 100,
      // Equal to dailySessions — sub-cap lifted; see the starter tier note.
      dailyPremiumSessions: 12,
      deepseekPeakHoursExcluded: true,
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
  // Deliberately does NOT restate the day/5-day/month figures: every surface
  // that shows these also shows those three numbers, and repeating them reads
  // as three different rules rather than one.
  const out = [
    // The Luna/Pro sub-cap line is emitted only while a cap actually binds —
    // with the cap lifted (dailyPremiumSessions === dailySessions) the
    // sentence would describe a restriction that does not exist.
    ...(tier.dailyPremiumSessions < tier.dailySessions
      ? [
          `${tier.dailyPremiumSessions} of your ${tier.dailySessions} daily sessions can be GPT 5.6 Luna or GLM 5.3 Flash; the rest use DeepSeek V4 Flash or Kimi K3 Eco`,
        ]
      : []),
    'The 5-day limit is a rolling window — it frees up as your oldest sessions age out, rather than resetting on a fixed day',
    'Daily sessions reset at midnight Pacific; unused ones do not carry over',
    'Adds to your free sessions rather than replacing them',
  ]
  out.push(
    `Up to $${tier.monthlySpendLimitUsd} of compute per month; plan sessions pause if reached, free sessions keep working`,
  )
  out.push('Limits are subject to change')
  if (tier.deepseekPeakHoursExcluded) {
    out.push('DeepSeek models are unavailable during weekday peak hours')
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

/**
 * Models that ONLY a paid session may open — the "Pro" rows.
 *
 * Distinct from `FREEBUFF_SUBSCRIPTION_MODEL_IDS`, which lists models a plan
 * meters. Those are available to everyone and the plan merely adds sessions;
 * these are available to subscribers ONLY, so a free account cannot start one
 * at all.
 *
 * EMPTY AGAIN as of 2026-08-26, and back to the state this comment originally
 * described. V4 Pro was its one entry for a few hours (#2254) and has since
 * been withdrawn from free mode entirely on cost — a row nothing may admit
 * cannot be sold, so leaving it here would advertise a paid tier whose first
 * send fails for subscribers too.
 *
 * GLM 5.3 Flash, which that comment named as the row this was built for, ships
 * in the same change as a FREE premium row capped at two sessions a day
 * (FREEBUFF_PER_MODEL_SESSION_CAPS) rather than a paid one. That is a product
 * decision and a deliberately reversible one: the machinery below is untouched,
 * so moving it behind the paywall later is one entry here — or, without a
 * deploy at all, one id in `FREEBUFF_PRO_ONLY_MODEL_IDS`.
 *
 * Everything else #2254 built stays live and simply has nothing to act on: the
 * service-account surface check, the off-peak closure, the DeepSeek-direct
 * route pin and the admission refusal are all still here and still tested.
 */
export const FREEBUFF_SUBSCRIPTION_PRO_MODEL_IDS: readonly string[] =
  Object.freeze([])

/**
 * The Pro rows are enforced on **Freebuff Web only**, for now.
 *
 * Desktop and the CLI keep serving V4 Pro exactly as they do today — free, at
 * every hour, on the Cheaper Inference lane with its existing fallbacks —
 * while Web moves to the paid, direct, off-peak arrangement. Legacy clients
 * are mid-transition and must not have a model taken away by a server deploy
 * they did not ask for.
 *
 * Web is identified server-side by the Freebuff Web SERVICE ACCOUNT key, never
 * by a client-supplied header, so a CLI cannot claim to be Web to dodge the
 * paywall — nor claim to be Desktop to reach the paid lane for free.
 */
export const FREEBUFF_PRO_ENFORCED_SURFACES = ['freebuff-web'] as const

/**
 * V4 Pro on Web is served by **DeepSeek direct**, whose card DOUBLES inside the
 * peak windows — which is exactly why the row is closed there rather than sold
 * at twice the cost. Distinct from the plan-level pause: this row is shut
 * outright on Web, for subscribers too.
 */
export function isFreebuffWebProClosedNow(
  id: string,
  now: Date = new Date(),
): boolean {
  if (!FREEBUFF_SUBSCRIPTION_PRO_MODEL_IDS.includes(id)) return false
  return isDeepSeekExpensiveWindow(now)
}

/** "3:00 AM – 5:00 PM" — when the Web Pro row is open, in the reader's zone. */
export function freebuffWebProOpenWindowLabel(
  now: Date = new Date(),
  timeZone?: string,
): string {
  return formatDeepSeekOffPeakWindowLocal(now, timeZone)
}

/** Whether `model` may only be opened on a paid session. Suffix-tolerant, like
 *  the other model predicates, so a dated provider snapshot cannot dodge it. */
export function isFreebuffSubscriptionProModelId(
  model: string | null | undefined,
  /** Extra ids from the server-side env knob; ignored on the client. */
  extra: readonly string[] = [],
): boolean {
  if (!model) return false
  const ids = [...FREEBUFF_SUBSCRIPTION_PRO_MODEL_IDS, ...extra]
  return ids.some((id) => model === id || model.startsWith(`${id}-`))
}

/**
 * When a PLAN's sessions on this model pause, for a subscriber.
 *
 * Deliberately separate from a model's own availability, because the two
 * differ: DeepSeek V4 Pro is open to everyone at every hour, but PLAN sessions
 * on it pause inside the expensive window — they fall back to the free pools,
 * paused rather than cut off. Only a subscriber sees this, and only on rows
 * where it is true.
 *
 * Lives here rather than beside the availability label because that module is
 * imported by this one; the reverse would be a cycle.
 */
export function getFreebuffPlanPauseWindowLabel(
  id: string,
  now: Date = new Date(),
  timeZone?: string,
): string | undefined {
  if (!FREEBUFF_SUBSCRIPTION_PEAK_PAUSED_MODEL_IDS.includes(id)) return undefined
  // A model already closed outright at peak needs no second sentence about it —
  // its availability label already names the same window.
  if (getFreebuffWebModel(id)?.availability === 'off_peak_only') return undefined
  return `Plan paused ${formatDeepSeekExpensiveWindowLocal(now, timeZone)}`
}
