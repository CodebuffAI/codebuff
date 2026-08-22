/**
 * Which ad network gets first refusal on a sponsored slot.
 *
 * Imprezia reaches users two different ways, and the whole point of this
 * module is that the two stay tellable apart:
 *
 * - As the PRIMARY for a random {@link IMPREZIA_EXPERIMENT_PERCENT}% of users.
 *   This is the experiment arm — a clean random subset whose revenue can be
 *   compared against control.
 * - As Gravity's FALLBACK for everyone else, ahead of Carbon. This is not
 *   random: it only ever sees the turns Gravity declined, which is a biased
 *   sample by construction and would drag the arm's numbers down if the two
 *   were pooled.
 *
 * Bucketing lives in `common` rather than in either web app because a user
 * must land in the same arm on every surface. Bucketing per product would let
 * one person be in the arm on the CLI and in control in chat, which makes
 * per-arm revenue uncomparable across products — the exact comparison this
 * experiment exists to support.
 */

/**
 * Salt for the assignment hash. Changing this re-randomizes every user, so it
 * carries a date: a new experiment gets a new key rather than silently
 * reshuffling this one's cohort mid-flight.
 */
export const IMPREZIA_EXPERIMENT = 'ads_imprezia_primary_2026_08'

/** Share of signed-in users who get Imprezia first refusal. */
export const IMPREZIA_EXPERIMENT_PERCENT = 10

export type AdExperimentArm = 'imprezia_first' | 'control'

/** FNV-1a 32-bit: tiny, dependency-free, stable across runtimes. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Deterministic arm for a signed-in user. Stable across devices, sessions and
 * products, because it is a pure function of the user id.
 */
export function adExperimentArmForUser(
  userId: string | null | undefined,
): AdExperimentArm {
  // Every ad surface rejects unauthenticated callers, so a missing id means no
  // ad is served at all. Park those in control rather than letting them dilute
  // the arm with impressions that never happened.
  if (!userId) return 'control'

  const bucket = fnv1a(`${IMPREZIA_EXPERIMENT}:${userId}`) % 100
  return bucket < IMPREZIA_EXPERIMENT_PERCENT ? 'imprezia_first' : 'control'
}
