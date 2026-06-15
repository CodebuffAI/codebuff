/**
 * Freebuff Web referral tiers.
 *
 * Each *qualified* referral (referred user's GitHub account is at least
 * MIN_GITHUB_ACCOUNT_AGE_MONTHS old at signup) raises the referrer's tier.
 * Tiers scale the daily model usage limits and unlock perks (deploy
 * watermark removal). In full/allowed regions both standard and premium
 * limits apply; in limited regions, users can still unlock tiers but only the
 * standard/free-model limit applies because premium models remain geo-gated.
 * All tunable numbers live in this file.
 */

/** Referred users must have a GitHub account at least this old for the
 *  referral to count. Younger accounts can still sign up normally — the
 *  referrer just gets no credit (anti-farming). */
export const MIN_GITHUB_ACCOUNT_AGE_MONTHS = 4

export interface FreebuffReferralTier {
  /** Tier index (0-based, in ascending order of referralsRequired). */
  tier: number
  /** Qualified referrals needed to reach this tier. */
  referralsRequired: number
  /** Daily message cap for standard (non-premium) models. */
  standardModelDailyLimit: number
  /** Daily message cap for premium models. */
  premiumModelDailyLimit: number
  /** Whether the "Powered by Freebuff" watermark is removed from deploys. */
  removesWatermark: boolean
}

/** Tier ladder: 1 referral, then +2 (3 total), then +4 (7 total). */
export const FREEBUFF_REFERRAL_TIERS: readonly FreebuffReferralTier[] = [
  {
    tier: 0,
    referralsRequired: 0,
    standardModelDailyLimit: 20,
    premiumModelDailyLimit: 3,
    removesWatermark: false,
  },
  {
    tier: 1,
    referralsRequired: 1,
    standardModelDailyLimit: 30,
    premiumModelDailyLimit: 4,
    removesWatermark: true,
  },
  {
    tier: 2,
    referralsRequired: 3,
    standardModelDailyLimit: 50,
    premiumModelDailyLimit: 6,
    removesWatermark: true,
  },
  {
    tier: 3,
    referralsRequired: 7,
    standardModelDailyLimit: 80,
    premiumModelDailyLimit: 10,
    removesWatermark: true,
  },
] as const

/**
 * Max attributed web signups (pending + completed) per referrer. The shared
 * `user.referral_limit` column (default 5) governs the CLI program; the web
 * ladder tops out at 7 qualified referrals, so it needs its own headroom —
 * generous enough for unqualified signups, small enough to bound farming.
 */
export const FREEBUFF_WEB_REFERRAL_LIMIT = 20

export const MAX_FREEBUFF_REFERRAL_TIER =
  FREEBUFF_REFERRAL_TIERS[FREEBUFF_REFERRAL_TIERS.length - 1].tier

/** Lowest tier whose perks include watermark removal. */
export const FREEBUFF_WATERMARK_REMOVAL_TIER = FREEBUFF_REFERRAL_TIERS.find(
  (tier) => tier.removesWatermark,
)!.tier

/** Qualified referrals needed before deploys drop the watermark. */
export const FREEBUFF_WATERMARK_REMOVAL_REFERRALS =
  FREEBUFF_REFERRAL_TIERS.find(
    (tier) => tier.removesWatermark,
  )!.referralsRequired

/** Highest tier unlocked by the given qualified referral count. */
export function getReferralTier(
  qualifiedReferralCount: number | null | undefined,
): FreebuffReferralTier {
  const count = Math.max(0, qualifiedReferralCount ?? 0)
  let unlocked = FREEBUFF_REFERRAL_TIERS[0]
  for (const tier of FREEBUFF_REFERRAL_TIERS) {
    if (count >= tier.referralsRequired) {
      unlocked = tier
    }
  }
  return unlocked
}

/** Tier limits by tier index (clamped into range). */
export function getTierLimits(tier: number): FreebuffReferralTier {
  const clamped = Math.min(Math.max(0, tier), MAX_FREEBUFF_REFERRAL_TIER)
  return FREEBUFF_REFERRAL_TIERS.find((t) => t.tier === clamped)!
}

/** Next tier above the given qualified referral count, or null if maxed. */
export function getNextReferralTier(
  qualifiedReferralCount: number | null | undefined,
): FreebuffReferralTier | null {
  const current = getReferralTier(qualifiedReferralCount)
  return (
    FREEBUFF_REFERRAL_TIERS.find((tier) => tier.tier === current.tier + 1) ??
    null
  )
}

/** Whether a GitHub account created at `githubCreatedAtMs` satisfies the
 *  referral age requirement at time `nowMs`. Months are computed on the
 *  calendar (e.g. created Jan 15 qualifies on/after May 15). */
export function isGithubAccountOldEnoughForReferral(
  githubCreatedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (githubCreatedAtMs == null || !Number.isFinite(githubCreatedAtMs)) {
    return false
  }
  const threshold = new Date(githubCreatedAtMs)
  threshold.setUTCMonth(threshold.getUTCMonth() + MIN_GITHUB_ACCOUNT_AGE_MONTHS)
  return nowMs >= threshold.getTime()
}
