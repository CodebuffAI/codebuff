/**
 * Freebucks — the spendable currency that unlocks premium models.
 *
 * ## What it is, and what it is NOT
 *
 * A Freebuck is one US cent of provider spend, priced a little above what a
 * session actually costs us. It is deliberately NOT Trust
 * (`freebuff_trust_balance`): Trust is EARNED standing that buys Levels and is
 * debited per prompt; Freebucks are a GRANTED, expiring budget that buys
 * sessions on models the free pools do not carry. Two currencies, two sinks —
 * keep the vocabulary separate everywhere a user can see it.
 *
 * ## Why session PRICES are flat, and why they sit above the mean
 *
 * Measured 2026-08-27 over 25,133 real sessions (each admit joined to its own
 * messages within `[admit, admit+1h)`), the per-session cost distribution is
 * violently skewed — p99/p50 runs from 5.9x to 17.6x:
 *
 *   model            avg    p50    p90    p99    max     msg/session
 *   glm-5.2         $1.366  0.738  3.861  6.147  7.82    84
 *   v4-flash        $0.208  0.142  0.477  1.011  5.20   105
 *   glm-5.3-flash   $0.130  0.094  0.314  0.553  1.04    48
 *   luna            $0.115  0.041  0.263  0.718  8.71    49
 *   mimo            $0.046  0.030  0.113  0.199  1.68    59
 *
 * A price at the MEDIAN loses money in aggregate, because the mean exceeds the
 * median for every model. A price at the MEAN is covered on average but the top
 * 1% of sessions cost 5-8x what they paid. So each price below sits between the
 * mean and p90, and {@link FREEBUCKS_SESSION_SPEND_CEILING_USD} caps the tail
 * that no flat price can cover — the same shape as the plan's monthly dollar
 * ceiling, for the same reason.
 *
 * Do not "correct" these to the measured averages. The gap IS the margin, and
 * it is what makes a granted Freebuck cost us less than a cent.
 */

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
} from './freebuff-model-ids'

/** Shown next to every balance. The coin glyph is drawn client-side. */
export const FREEBUCKS_LABEL = 'Freebucks'
export const FREEBUCKS_LABEL_SINGULAR = 'Freebuck'

/**
 * Cents per Freebuck. One, and it must stay one: the whole point of the unit is
 * that a grant of N Freebucks is an upper bound of N cents of provider spend,
 * so the allowance tables below double as the cost model. If this ever needs to
 * change, change the PRICES instead.
 */
export const FREEBUCKS_CENTS_PER_UNIT = 1

/**
 * Per-session price by model, in Freebucks.
 *
 * Every entry is `round(price)` where price sits between the measured mean and
 * p90 for that model — see the table in the file header. A model absent from
 * this map is NOT purchasable with Freebucks; that is the allowlist, so adding
 * a model here is what makes it sellable.
 */
export const FREEBUCKS_SESSION_PRICES: Readonly<Record<string, number>> =
  Object.freeze({
    // avg 11 FB, p90 26. Cheapest premium session we sell.
    'openai/gpt-5.6-luna': 15,
    // avg 13 FB, p90 31. Sessions run short (48 messages) which is why this
    // lands beside Luna rather than near V4 Flash.
    'z-ai/glm-5.3-flash': 15,
    // avg 21 FB, p90 48. The longest sessions we sell (105 messages).
    [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]: 25,
    // avg 18 FB measured 2026-08-24, the last day it carried free traffic
    // before leaving free mode. STALE BY CONSTRUCTION — it has had no free
    // sessions since, so there is nothing newer to price against. Re-measure
    // once Freebucks puts traffic back on it.
    [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: 25,
    // avg 137 FB, p90 386. An order of magnitude dearer than everything else
    // here, and priced to say so.
    'z-ai/glm-5.2': 150,
  })

/**
 * The `free_session_admit.pool` token for a session bought with Freebucks.
 *
 * Opaque to clients, which group by it and never match on the value. Its job
 * server-side is to keep three accountings apart: free pools, `subscription:%`
 * plan windows, and bought sessions. The plan windows filter on
 * `subscription:%`, so a Freebucks session never eats plan allowance — and the
 * debit path finds its work by looking for this token.
 */
export const FREEBUCKS_ADMIT_POOL = 'freebucks'

export function freebucksSessionPrice(modelId: string): number | undefined {
  return FREEBUCKS_SESSION_PRICES[modelId]
}

export function isFreebucksPurchasableModelId(modelId: string): boolean {
  return freebucksSessionPrice(modelId) !== undefined
}

/** Every model Freebucks can buy, in ascending price then id order. */
export const FREEBUCKS_PURCHASABLE_MODEL_IDS: readonly string[] = Object.freeze(
  Object.keys(FREEBUCKS_SESSION_PRICES).sort(
    (a, b) =>
      FREEBUCKS_SESSION_PRICES[a] - FREEBUCKS_SESSION_PRICES[b] ||
      a.localeCompare(b),
  ),
)

/**
 * The dollar ceiling ONE session may reach before its Freebucks lane is cut.
 *
 * A flat price cannot cover a p99 that is 17.6x the median, and the measured
 * maxima are worse still — a single Luna session reached $8.71 and one
 * user-hour reached $20.34. Without this, one runaway session eats a month's
 * grant and we eat the difference. At the cap the Freebucks lane stops and the
 * caller falls back to the free pools, exactly like the plan's spend ceiling:
 * they are not cut off, they simply stop spending Freebucks.
 *
 * Set at ~4x the dearest non-GLM-5.2 p99 so it only ever catches the tail.
 */
export const FREEBUCKS_SESSION_SPEND_CEILING_USD = 4

/** Pacific, matching every other Freebuff reset window. */
export const FREEBUCKS_RESET_TIMEZONE = 'America/Los_Angeles'
/** Rolling, not calendar — same rule as the plan's 5-day window. */
export const FREEBUCKS_WEEK_WINDOW_DAYS = 7

/**
 * A Freebucks allowance across the three windows.
 *
 * The windows are deliberately SUB-ADDITIVE: `week < 7 x day` and
 * `month < 30 x day`. That is the whole cost control. 104 users took between 20
 * and 748 session-units in a single day, and without a week and month bound a
 * daily grant simply becomes a monthly one for exactly the accounts that cost
 * the most.
 */
export interface FreebucksAllowance {
  daily: number
  weekly: number
  monthly: number
}

/**
 * What a FREE account gets, by access tier.
 *
 * Funded rather than invented: retiring free DeepSeek V4 Pro returned
 * ~$2,293/day, which over 26,491 daily actives is ~8.7 FB/user/day, and the
 * measured provider re-routes (V4 Flash to luminal, GLM 5.2 off infron) are
 * worth another ~$2,511/day, or ~9.5 FB/user/day. 20 FB/day sits inside that
 * headroom at a realistic redemption rate and buys one premium session a day —
 * which is the entire pitch.
 *
 * `limited` is half of `full` for the same reason the session pools are: the
 * tier exists because those regions cost more per session to serve.
 */
export const FREEBUCKS_FREE_ALLOWANCE: Readonly<
  Record<'full' | 'limited', FreebucksAllowance>
> = Object.freeze({
  full: Object.freeze({ daily: 20, weekly: 80, monthly: 200 }),
  // 15, not 10, and the floor is load-bearing: the cheapest session we sell is
  // 15 FB, so a 10 FB grant would show this tier a currency it could never
  // spend on anything. A daily grant must buy at least one session or it is
  // just a number that makes people feel poor. Enforced by a test.
  limited: Object.freeze({ daily: 15, weekly: 60, monthly: 150 }),
})

/**
 * What each PAID tier adds ON TOP of the free allowance.
 *
 *   Starter    200 /   800 /  2,500   (plus a separate $40 token cap)
 *   Plus       500 / 2,000 /  7,000   (plus a separate $100 token cap)
 *
 * ## Two caps, deliberately not one
 *
 * Freebucks and the tier's `monthlySpendLimitUsd` are SEPARATE ceilings and a
 * session must clear both. They measure different things: Freebucks price a
 * session at a flat rate set from its MEDIAN-to-p90 cost, while the token cap
 * bounds what the tail actually bills. Collapsing them into one number would
 * make the flat price load-bearing for the tail it is explicitly not designed
 * to cover — the whole reason {@link FREEBUCKS_SESSION_SPEND_CEILING_USD}
 * exists. So Starter's 2,500 Freebucks ($25 of sessions at list price) sits
 * under a $40 token ceiling, and the gap absorbs the sessions that overrun
 * their price. Marketing must state both; one without the other is a promise
 * we cannot keep.
 *
 * Plus is 2.5x Starter on the daily and weekly windows but 2.8x on the month
 * (7,000 against 2,500), which is intentional: the monthly window is the one a
 * heavy user actually lives in, so the upgrade is worth more there than the
 * headline ratio suggests. The tests assert 2.5x on day and week and only a
 * FLOOR on the month, so this stays a deliberate choice rather than drift.
 *
 * The WEEKLY figure has to clear two bounds at once:
 *   - below `7 x daily` (1,400 for Starter), or the week stops capping anything
 *     and a daily grant becomes a monthly one for the heaviest accounts;
 *   - above `monthly / 4.348` (575 for Starter), or the WEEK binds first and
 *     the advertised monthly total is unreachable.
 * Any re-tune has to re-check both; the tests assert them.
 *
 * Same free-first rule the session pools follow: a subscriber spends their free
 * Freebucks first, and the plan tops the pool up rather than replacing it.
 */
export const FREEBUCKS_PLAN_ALLOWANCE: Readonly<
  Record<string, FreebucksAllowance>
> = Object.freeze({
  starter: Object.freeze({ daily: 200, weekly: 800, monthly: 2500 }),
  plus: Object.freeze({ daily: 500, weekly: 2000, monthly: 7000 }),
})

export function freebucksPlanAllowance(
  tierId: string | null | undefined,
): FreebucksAllowance | undefined {
  if (!tierId) return undefined
  return FREEBUCKS_PLAN_ALLOWANCE[tierId]
}

/** Free allowance + whatever the caller's plan adds. */
export function freebucksTotalAllowance(params: {
  accessTier: 'full' | 'limited'
  tierId?: string | null
}): FreebucksAllowance {
  const free =
    FREEBUCKS_FREE_ALLOWANCE[params.accessTier] ?? FREEBUCKS_FREE_ALLOWANCE.full
  const plan = freebucksPlanAllowance(params.tierId)
  if (!plan) return { ...free }
  return {
    daily: free.daily + plan.daily,
    weekly: free.weekly + plan.weekly,
    monthly: free.monthly + plan.monthly,
  }
}

/** Which window a debit of `cost` would breach first, or null if it fits. */
export type FreebucksWindow = 'daily' | 'weekly' | 'monthly'

export function freebucksBlockingWindow(params: {
  cost: number
  remaining: Readonly<Record<FreebucksWindow, number>>
}): FreebucksWindow | null {
  const order: FreebucksWindow[] = ['daily', 'weekly', 'monthly']
  // Daily first so the message a user sees names the window that will reopen
  // soonest — the same rule the session quotas use for `resetAt`.
  for (const w of order) {
    if (params.remaining[w] < params.cost) return w
  }
  return null
}

export function formatFreebucks(amount: number): string {
  return Math.max(0, Math.round(amount)).toLocaleString()
}

export function freebucksWindowLabel(window: FreebucksWindow): string {
  return window === 'daily'
    ? 'today'
    : window === 'weekly'
      ? 'this week'
      : 'this month'
}

/** Plain-language allowance summary, used on the plans page and in settings. */
export function freebucksAllowanceSummary(a: FreebucksAllowance): string {
  return `${formatFreebucks(a.daily)}/day · ${formatFreebucks(
    a.weekly,
  )}/week · ${formatFreebucks(a.monthly)}/month`
}
