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

/** Stable salt: changing the percentage grows/shrinks one persistent cohort. */
export const FIRST_PARTY_ROUTING_EXPERIMENT =
  'ads_first_party_before_paid_networks_2026_08'

/** Unset env values preserve the initial launch allocation. */
export const DEFAULT_FIRST_PARTY_PRIMARY_PERCENT = 10
export const DEFAULT_FIRST_PARTY_BACKFILL = true

export type FirstPartyAdRoute =
  | 'paid_network_only'
  | 'first_party_primary'
  | 'gravity_then_first_party'

export interface FirstPartyRoutingConfig {
  /** Stable share, 0..100, that tries our book before paid networks. */
  primaryPercent: number
  /** Whether the remaining paid-network cohort uses our book as backfill. */
  backfill: boolean
}

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

/**
 * Choose the request's routing policy.
 *
 * Percentage changes do not reshuffle users: raising 10 → 20 adds the next
 * ten points of the same 10,000-bucket cohort. The function clamps direct
 * callers defensively; the runtime env schema rejects out-of-range values.
 */
export function firstPartyAdRouteForUser(
  userId: string | null | undefined,
  config: FirstPartyRoutingConfig,
): FirstPartyAdRoute {
  if (!userId) return 'paid_network_only'
  const configuredPercent = Number.isFinite(config.primaryPercent)
    ? config.primaryPercent
    : DEFAULT_FIRST_PARTY_PRIMARY_PERCENT
  const primaryPercent = Math.min(100, Math.max(0, configuredPercent))
  const bucket = fnv1a(`${FIRST_PARTY_ROUTING_EXPERIMENT}:${userId}`) % 10_000
  if (bucket < primaryPercent * 100) return 'first_party_primary'
  return config.backfill ? 'gravity_then_first_party' : 'paid_network_only'
}
