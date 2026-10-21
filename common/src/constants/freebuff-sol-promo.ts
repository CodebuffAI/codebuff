/**
 * The two US-or-paid flagship rows: GPT-6.1 Sol (2026-09-29) and Gemini 4
 * Argon (2026-10-13). Both are ONE SESSION A DAY for every account, paid
 * plans included.
 *
 * `GEMINI_4_ARGON_ENDING_SOON` is Argon's `dealEndingSoon` field and its server
 * price notice (`freebucksPricing().priceNotices`) that released CLI and
 * Desktop builds render in place of the tagline: one constant so the two
 * cannot disagree, naming the daily limit so nobody meets it first as a
 * refusal. Sol (250 since 2026-10-13, 100 at launch) is no longer labelled a
 * promotion (product, 2026-10-15); its tagline names the limit instead.
 *
 * A leaf module, like freebuff-solar-promo.ts, because the Freebucks price
 * map, the model catalog and the admission debit all read it and none may
 * import the others.
 */
import { getFreebuffModelPolicyOverlay } from './freebuff-model-policy-overlay'

export const GPT_61_SOL_MODEL_ID = 'openai/gpt-6.1-sol'
export const GEMINI_4_ARGON_MODEL_ID = 'google/gemini-4-argon'

/**
 * Argon's one pill since 2026-10-22 (product): "Ending soon", replacing the
 * Promotional and Price change pills. The promotional price does not cover
 * the row's cost and will move to what Google charges; the hover also keeps
 * the daily limit, so nobody meets it first as a refusal.
 */
export const GEMINI_4_ARGON_ENDING_SOON = {
  short: 'Ending soon',
  tooltip:
    'This promotional price ends soon, to reflect what our provider charges (out of our control). One session a day on every plan.',
} as const

/**
 * Models capped at N paid session-hours per Freebucks day, for EVERY account
 * (a plan does not lift it). Enforced by the admission debit under the account
 * lock (`debitAdmission`), counting the day's session debits for the model
 * (except failed starts and hours refunded in full), so it holds on every
 * surface and against parallel starts.
 * Re-entering an hour already paid for never debits, so it is not a second
 * session; a Desktop renewal of a tab's next hour is.
 */
export const FREEBUFF_DAILY_SESSION_LIMITS: Readonly<Record<string, number>> =
  Object.freeze({
    [GPT_61_SOL_MODEL_ID]: 1,
    [GEMINI_4_ARGON_MODEL_ID]: 1,
  })

/**
 * The daily session limit admission enforces for a model, or undefined for
 * none. The server catalog's value wins (`null` there means "no limit", even
 * for a model with a compiled one).
 */
export function freebuffDailySessionLimit(modelId: string): number | undefined {
  const override = getFreebuffModelPolicyOverlay()?.dailySessionLimit?.(modelId)
  if (override === null) return undefined
  if (override !== undefined) return override
  return FREEBUFF_DAILY_SESSION_LIMITS[modelId]
}
