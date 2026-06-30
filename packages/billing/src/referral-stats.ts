import {
  MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
  REFERRAL_CLI_DAILY_SESSION_BONUS_CAP,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import { FREEBUFF_GLM_V52_REFERRAL_CAP } from '@codebuff/common/constants/freebuff-models'
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

/**
 * Unified referral read model (docs/referrals.md).
 *
 * One referral per referred user (`referral_v2`); each carries the access tier
 * the referred user activated at. Products derive their benefit from these two
 * counts rather than from a per-program score:
 *
 *   - fullQualified    → GLM 5.2 sessions / Opus
 *   - limitedQualified → Freebuff CLI daily-session bonus
 *
 * A referral COUNTS when it is qualified, activated, and not revoked, where:
 *   - qualified  = the referred user's GitHub account is at least
 *     MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL old — DERIVED from the immutable
 *     `github_account_created_at` (never stored as a flag), so it ages in
 *     automatically with no sweep.
 *   - activated  = `activated_at` is set (the referred user used a product).
 *   - not revoked = `revoked_at` is null.
 *
 * Self-referral bump: a referrer's OWN referral (the row where they are the
 * referred party) counts too, at the tier they activated at — i.e. being
 * referred and qualifying is worth +1 to yourself, mirroring the legacy
 * per-program score. Because `referred_id` is the PK, that self row is counted
 * at most once, and self-referral is blocked, so a row is never both. It routes
 * by tier like any other: a full-tier self-referral feeds GLM/Opus/Web, a
 * limited-tier one feeds the CLI daily bonus/Web.
 */
export interface ReferralStats {
  /** Counting referrals whose referred user activated at the 'full' tier. */
  fullQualified: number
  /** Counting referrals whose referred user activated at the 'limited' tier. */
  limitedQualified: number
}

/**
 * Count a referrer's qualified-and-activated referrals, split by the access tier
 * the referred user activated at. Qualification is derived from the referred
 * user's GitHub account age (joined via `referred_github_user_id`); referrals
 * with no GitHub identity never qualify (the join drops them).
 *
 * Includes the self-referral bump: the row where this user is themselves the
 * referred party (`referred_id = referrerId`) counts too, at their own
 * activation tier — see the module doc above.
 */
export async function getReferralStats(params: {
  referrerId: string
}): Promise<ReferralStats> {
  const rows = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE r.activation_access_tier = 'full')::int
        AS "fullQualified",
      count(*) FILTER (WHERE r.activation_access_tier = 'limited')::int
        AS "limitedQualified"
    FROM referral_v2 r
    JOIN referral_qualification q
      ON q.github_user_id = r.referred_github_user_id
    WHERE (r.referrer_id = ${params.referrerId}
           OR r.referred_id = ${params.referrerId})
      AND r.activated_at IS NOT NULL
      AND r.revoked_at IS NULL
      AND q.github_account_created_at
        <= now() - (${MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL} || ' months')::interval
  `)) as unknown as Record<string, unknown>[]

  // The aggregate always returns exactly one row (count is 0 when nothing
  // matches); `?? 0` and Number() just coerce the driver's count type.
  const row = rows[0]
  return {
    fullQualified: Number(row?.fullQualified ?? 0),
    limitedQualified: Number(row?.limitedQualified ?? 0),
  }
}

/**
 * Weekly GLM 5.2 sessions a referrer has earned: one per full-access qualified
 * referral, capped. GLM is a full-access-only reward — the referrer must be on
 * full access to actually start a GLM session (enforced at admission by
 * `resolveFreebuffModelForAccessTier`, which downgrades a limited-tier user's
 * GLM request). A limited-access referrer's reward is the daily-session bonus
 * (see `cliDailySessionBonusFromStats`), not GLM — deliberately, to avoid a
 * limited/VPN-region GLM farming vector.
 */
export function glmWeeklySessionsFromStats(stats: ReferralStats): number {
  return Math.min(stats.fullQualified, FREEBUFF_GLM_V52_REFERRAL_CAP)
}

/**
 * Freebuff CLI daily free-mode session BONUS (added on top of the base limited
 * allowance): +1 per limited-tier qualified referral, capped. Returns just the
 * bonus; the caller adds it to the base daily limit.
 */
export function cliDailySessionBonusFromStats(stats: ReferralStats): number {
  return Math.min(stats.limitedQualified, REFERRAL_CLI_DAILY_SESSION_BONUS_CAP)
}
