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

/** GLM 5.2 referral program uses a stricter account-age bar than the web
 *  program (no public-repo requirement, but the account must be a full year
 *  old) since the reward — paid GLM serverless time — costs more to abuse. */
export const MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM = 12

/**
 * Unified referral system (docs/referrals.md): a single 4-month GitHub
 * account-age bar for ALL products (no public-repo requirement), consolidating
 * the old per-program bars (cli/glm = 12mo, web = 4mo).
 */
export const MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL = 4

/**
 * Freebuff CLI limited-tier perk: each qualified referral whose referred user
 * activated at the *limited* access tier grants +1 daily free-mode session,
 * capped here (e.g. 5 base + 3 = 8/day). Full-access referrals instead grant
 * GLM sessions (see FREEBUFF_GLM_V52_REFERRAL_CAP).
 */
export const REFERRAL_CLI_DAILY_SESSION_BONUS_CAP = 3

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
    standardModelDailyLimit: 24,
    premiumModelDailyLimit: 4,
    removesWatermark: false,
  },
  {
    tier: 1,
    referralsRequired: 1,
    standardModelDailyLimit: 40,
    premiumModelDailyLimit: 6,
    removesWatermark: true,
  },
  {
    tier: 2,
    referralsRequired: 3,
    standardModelDailyLimit: 70,
    premiumModelDailyLimit: 10,
    removesWatermark: true,
  },
  {
    tier: 3,
    referralsRequired: 7,
    standardModelDailyLimit: 110,
    premiumModelDailyLimit: 15,
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

/**
 * A referral can only be attributed within this many days of the referred
 * user's signup — stops a referrer from claiming long-pre-existing accounts.
 * (Lived in packages/billing's referral-program.ts as the legacy redeem gate;
 * hoisted here so the unified referral_v2 attribution path can enforce it too,
 * without a billing→billing import cycle.)
 */
export const REFERRAL_SIGNUP_WINDOW_DAYS = 30

/**
 * Max attributed referrals (referral_v2 rows) a single referrer may accumulate.
 * A generous anti-spam ceiling only — every actual reward is already capped at
 * read time (GLM at FREEBUFF_GLM_V52_REFERRAL_CAP, the web tier ladder, the CLI
 * bonus at REFERRAL_CLI_DAILY_SESSION_BONUS_CAP), so this never throttles a
 * legitimate referrer; it just bounds pathological row creation.
 */
export const FREEBUFF_REFERRAL_SIGNUP_LIMIT = 100

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
 *  calendar (e.g. created Jan 15 qualifies on/after May 15). `minMonths`
 *  defaults to the web bar; the GLM program passes
 *  MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM. */
export function isGithubAccountOldEnoughForReferral(
  githubCreatedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
  minMonths: number = MIN_GITHUB_ACCOUNT_AGE_MONTHS,
): boolean {
  if (githubCreatedAtMs == null || !Number.isFinite(githubCreatedAtMs)) {
    return false
  }
  const threshold = new Date(githubCreatedAtMs)
  threshold.setUTCMonth(threshold.getUTCMonth() + minMonths)
  return nowMs >= threshold.getTime()
}
