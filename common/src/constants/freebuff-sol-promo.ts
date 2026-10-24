/**
 * The two US-or-paid flagship rows: GPT-6.1 Sol (2026-09-29) and Gemini 4
 * Argon (2026-10-13). Both are ONE SESSION A DAY for every account, paid
 * plans included.
 *
 * Argon's promotional price ended at the 2026-10-23 repricing (250), and the
 * row is being retired (2026-10-24, FREEBUFF_LEAVING_SOON). Sol (200 since
 * 2026-10-23) is no longer labelled a promotion (product, 2026-10-15); its
 * tagline names the limit instead.
 *
 * A leaf module, like freebuff-solar-promo.ts, because the Freebucks price
 * map, the model catalog and the admission debit all read it and none may
 * import the others.
 */
import { getFreebuffModelPolicyOverlay } from './freebuff-model-policy-overlay'

export const GPT_61_SOL_MODEL_ID = 'openai/gpt-6.1-sol'
export const GEMINI_4_ARGON_MODEL_ID = 'google/gemini-4-argon'

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
