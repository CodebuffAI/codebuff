import {
  MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
  REFERRAL_CLI_DAILY_SESSION_BONUS_CAP,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import { FREEBUFF_GLM_V52_REFERRAL_CAP } from '@codebuff/common/constants/freebuff-models'
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

/**
 * SQL expression that resolves a referral's referred GitHub id: the denormalized
 * burn-once `referred_github_user_id` when set, else a fallback to the referred
 * user's linked GitHub account (the denormalized id is only written on the
 * NextAuth linkAccount web event, so links via other paths leave it NULL and the
 * referral would otherwise be silently dropped from qualification).
 *
 * The fallback carries the SAME burn-once guard as linkReferralV2GithubId: it
 * only resolves to a GitHub identity that no other referral_v2 row already
 * holds. Without it, a re-signup's NULL row (left NULL precisely because the
 * identity was burned by an earlier referral) would be re-credited via the
 * account table — crediting one GitHub identity to two referrers. Shared by
 * getReferralStats and the /api/web/referrals list so the two never diverge.
 *
 * References the OUTER `referral_v2` row, so the consuming query must keep that
 * table unaliased (its own name) in FROM.
 */
export const referredGithubIdSql = sql<string | null>`COALESCE(
  referral_v2.referred_github_user_id,
  (SELECT a."providerAccountId"
     FROM account a
    WHERE a."userId" = referral_v2.referred_id
      AND a.provider = 'github'
      AND NOT EXISTS (
        SELECT 1 FROM referral_v2 e
        WHERE e.referred_github_user_id = a."providerAccountId"
      )
    ORDER BY a."providerAccountId"
    LIMIT 1)
)`

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
 * user's GitHub account age, joined via the denormalized `referred_github_user_id`
 * with a fallback to the referred user's linked GitHub account when that id is
 * NULL (it's only populated on the linkAccount web event, so other link paths
 * can leave it unset). A referred user with no linked GitHub never qualifies.
 *
 * Includes the self-referral bump: the row where this user is themselves the
 * referred party (`referred_id = referrerId`) counts too, at their own
 * activation tier — see the module doc above.
 */
export async function getReferralStats(params: {
  referrerId: string
  /** Injectable connection (defaults to the shared db) for integration tests. */
  conn?: typeof db
}): Promise<ReferralStats> {
  const conn = params.conn ?? db
  // Table kept unaliased so `referredGithubIdSql` (which references the outer
  // `referral_v2` row + carries the burn-once guard) resolves correctly.
  const rows = (await conn.execute(sql`
    SELECT
      count(*) FILTER (WHERE referral_v2.activation_access_tier = 'full')::int
        AS "fullQualified",
      count(*) FILTER (WHERE referral_v2.activation_access_tier = 'limited')::int
        AS "limitedQualified"
    FROM referral_v2
    JOIN referral_qualification
      ON referral_qualification.github_user_id = ${referredGithubIdSql}
    WHERE (referral_v2.referrer_id = ${params.referrerId}
           OR referral_v2.referred_id = ${params.referrerId})
      AND referral_v2.activated_at IS NOT NULL
      AND referral_v2.revoked_at IS NULL
      AND referral_qualification.github_account_created_at
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
