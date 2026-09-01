/**
 * Which ad network gets first refusal on a sponsored slot.
 *
 * Imprezia reaches users three ways, and this module keeps them tellable apart:
 *
 * - Exclusively for the Imprezia team and our test account.
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

/**
 * Stable salt for request sampling. The sample key rotates per ad request, but
 * the hash must stay shared by the route gate and campaign allocator.
 */
export const FIRST_PARTY_ROUTING_EXPERIMENT =
  'ads_first_party_before_paid_networks_2026_08'

/**
 * An absent runtime knob is a dark deploy. Allocation is deliberately opt-in:
 * a missing Infisical value must not take paid-network inventory.
 */
export const DEFAULT_FIRST_PARTY_PRIMARY_PERCENT = 0
export const DEFAULT_FIRST_PARTY_BACKFILL = false
export const DEFAULT_FIRST_PARTY_GEO_ROUTING = false
export const DEFAULT_FIRST_PARTY_TIER2_BONUS_PERCENT = 0
export const DEFAULT_FIRST_PARTY_IMPREZIA_ARM_PERCENT = 0

/**
 * Coarse, server-resolved inventory geography. `unknown` is intentionally its
 * own value: a missing/untrusted country signal must never be treated as a
 * premium country or admitted to free advertiser inventory.
 */
export type FirstPartyAdGeoTier = 'tier1' | 'tier2' | 'unknown'

export type FirstPartyAdRoute =
  | 'paid_network_only'
  | 'first_party_primary'
  | 'gravity_then_first_party'
  | 'paid_networks_then_first_party_bonus'
  /**
   * Our book ahead of Imprezia, with Gravity's position unchanged. Only ever
   * chosen for the `imprezia_first` arm, where Imprezia holds first refusal:
   * a fill here displaces Imprezia's slot, and Gravity still backs both up.
   * Never a control-arm route -- there Gravity is the primary, and putting
   * our book in front of it is what the primary gate already meters.
   */
  | 'first_party_before_imprezia'

export interface FirstPartyRoutingConfig {
  /** Request share, 0..100, that tries our book before paid networks. */
  primaryPercent: number
  /** Whether the remaining paid-network cohort uses our book as backfill. */
  backfill: boolean
}

export interface FirstPartyGeoRoutingConfig extends FirstPartyRoutingConfig {
  /** Dark-deploy gate. Off preserves the pre-geo routing policy exactly. */
  geoRouting: boolean
  /** Share of terminal Tier-2 paid no-fills offered non-billable inventory. */
  tier2BonusPercent: number
  /**
   * Share, 0..100, of the `imprezia_first` arm's Tier-1 requests that try our
   * book before Imprezia. Sampled from the same request bucket as the primary
   * gate and stacked on top of it, so raising this never shrinks the primary
   * window. Absent means 0, the dark deploy.
   */
  impreziaArmPercent?: number
}

/**
 * Normalize the percentage knob to the 10,000-bucket precision used by both
 * request routing and campaign allocation. Keeping this conversion shared
 * prevents decimal environment values from opening a route that the campaign
 * selector later rejects (or vice versa).
 */
export function firstPartyPrimaryBasisPoints(primaryPercent: number): number {
  const configuredPercent = Number.isFinite(primaryPercent)
    ? primaryPercent
    : DEFAULT_FIRST_PARTY_PRIMARY_PERCENT
  return Math.round(Math.min(100, Math.max(0, configuredPercent)) * 100)
}

/**
 * Map one server-minted request sample to the allocator's 10,000-bucket space.
 * Both routing and campaign selection use this exact function so a request
 * admitted to first-party inventory cannot land in a different campaign slice.
 */
export function firstPartyPrimaryBucket(sampleId: string): number {
  return fnv1a(`${FIRST_PARTY_ROUTING_EXPERIMENT}:${sampleId}`) % 10_000
}

export type AdExperimentArm = 'imprezia_forced' | 'imprezia_first' | 'control'

export function isImpreziaAudienceEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return (
    normalized === 'jahooma@gmail.com' || normalized.endsWith('@imprezia.ai')
  )
}

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
 * Deterministic arm for a signed-in user, stable across products and sessions.
 */
export function adExperimentArmForUser(
  userId: string | null | undefined,
  userEmail?: string | null,
): AdExperimentArm {
  // Every ad surface rejects unauthenticated callers, so a missing id means no
  // ad is served at all. Park those in control rather than letting them dilute
  // the arm with impressions that never happened.
  if (!userId) return 'control'

  if (isImpreziaAudienceEmail(userEmail)) return 'imprezia_forced'

  const bucket = fnv1a(`${IMPREZIA_EXPERIMENT}:${userId}`) % 100
  return bucket < IMPREZIA_EXPERIMENT_PERCENT ? 'imprezia_first' : 'control'
}

/**
 * Choose the request's routing policy.
 *
 * Production callers pass a fresh server-minted `sampleId` for each ad request
 * so a percentage applies to requests, not a permanently pinned set of users.
 * The fallback to `userId` preserves deterministic behavior for old callers
 * and tests. The function clamps direct callers defensively; the runtime env
 * schema rejects out-of-range values.
 */
export function firstPartyAdRouteForUser(
  userId: string | null | undefined,
  config: FirstPartyRoutingConfig,
  sampleId?: string,
): FirstPartyAdRoute {
  if (!userId) return 'paid_network_only'
  const bucket = firstPartyPrimaryBucket(sampleId || userId)
  if (bucket < firstPartyPrimaryBasisPoints(config.primaryPercent)) {
    return 'first_party_primary'
  }
  return config.backfill ? 'gravity_then_first_party' : 'paid_network_only'
}

/**
 * Apply the geo-aware policy without changing the legacy gate's semantics.
 *
 * - Tier 1 keeps the configured primary/backfill policy.
 * - Tier 2 never preempts a paid provider. Once the caller proves that every
 *   paid provider available on that surface has declined, a sampled request
 *   may receive explicitly non-billable bonus inventory.
 * - Unknown geography stays on paid networks only.
 *
 * `terminalPaidFallback` is server routing context, not a claim that a
 * particular network filled. Browser surfaces set it only on the second leg
 * of their sequencer, after the other paid network has returned no fill.
 *
 * `impreziaFirstRefusal` says whether Imprezia holds first refusal on THIS
 * request's chain -- the `imprezia_first` arm on a surface that asks Imprezia
 * before Gravity, and never a pin. It is the only thing that unlocks the
 * Imprezia-preempt leg: a Tier-1 request that missed the primary window may
 * still try our book before Imprezia when its sample lands in the next
 * `impreziaArmPercent` of buckets. The field is required rather than
 * defaulted so a surface where Gravity goes first cannot forget to say so and
 * end up with our book in front of Gravity.
 */
export function firstPartyAdRouteForGeoRequest(
  userId: string | null | undefined,
  config: FirstPartyGeoRoutingConfig,
  context: {
    geoTier: FirstPartyAdGeoTier
    terminalPaidFallback: boolean
    impreziaFirstRefusal: boolean
  },
  sampleId?: string,
): FirstPartyAdRoute {
  if (!config.geoRouting) {
    return firstPartyAdRouteForUser(userId, config, sampleId)
  }
  if (!userId) return 'paid_network_only'
  if (context.geoTier === 'tier1') {
    // One bucket, one ladder: the primary window first, then the preempt
    // window stacked directly above it. Both read the same sample so the two
    // windows can never overlap, and raising the arm knob never shrinks the
    // primary window. A stack past 100% is simply "every remaining request".
    const bucket = firstPartyPrimaryBucket(sampleId || userId)
    const primaryBasisPoints = firstPartyPrimaryBasisPoints(
      config.primaryPercent,
    )
    if (bucket < primaryBasisPoints) return 'first_party_primary'
    if (
      context.impreziaFirstRefusal &&
      bucket <
        primaryBasisPoints +
          firstPartyPrimaryBasisPoints(
            config.impreziaArmPercent ??
              DEFAULT_FIRST_PARTY_IMPREZIA_ARM_PERCENT,
          )
    ) {
      return 'first_party_before_imprezia'
    }
    return config.backfill ? 'gravity_then_first_party' : 'paid_network_only'
  }
  if (
    context.geoTier === 'tier2' &&
    context.terminalPaidFallback &&
    firstPartyPrimaryBucket(sampleId || userId) <
      firstPartyPrimaryBasisPoints(config.tier2BonusPercent)
  ) {
    return 'paid_networks_then_first_party_bonus'
  }
  return 'paid_network_only'
}
