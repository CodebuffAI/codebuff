import { FREEBUFF_GLM_V52_REFERRAL_ENABLED } from '@codebuff/common/constants/freebuff-models'
import {
  cliDailySessionBonusFromStats,
  getReferralStats,
} from '@codebuff/billing/referral-stats'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq } from 'drizzle-orm'

import { getGlmWeeklyUsage } from './public-api'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type { FreebuffReferralInfo } from '@codebuff/common/types/freebuff-session'

/**
 * The share-link identity shared by both referral-block variants: the user's
 * referral code, a personalization name, and whether they have a GitHub linked
 * (Google-only users are prompted to connect one so their referral can qualify).
 *
 * Returns null when the user has no referral code yet (every user gets one on
 * signup, so this is rare) — callers then omit the banner entirely.
 */
async function getReferralIdentity(userId: string): Promise<{
  code: string
  referrerName: string | null
  githubLinked: boolean
} | null> {
  const [[userRow], [githubAccount]] = await Promise.all([
    db
      .select({
        referralCode: schema.user.referral_code,
        name: schema.user.name,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
    // Join the GitHub account to its cached qualification row to recover the
    // GitHub login, used as a display-name fallback for the invite page.
    db
      .select({
        provider: schema.account.provider,
        githubLogin: schema.referralQualification.github_login,
      })
      .from(schema.account)
      .leftJoin(
        schema.referralQualification,
        eq(
          schema.referralQualification.github_user_id,
          schema.account.providerAccountId,
        ),
      )
      .where(
        and(
          eq(schema.account.userId, userId),
          eq(schema.account.provider, 'github'),
        ),
      )
      .limit(1),
  ])

  const code = userRow?.referralCode
  if (!code) return null

  return {
    code,
    // Prefer the display name; fall back to the GitHub login (handle) so
    // GitHub-only users with no name set still personalize the invite page.
    referrerName:
      userRow?.name?.trim() || githubAccount?.githubLogin?.trim() || null,
    githubLinked: Boolean(githubAccount),
  }
}

/**
 * Assemble the referral block the CLI model-selector renders to advertise the
 * "invite friends" reward. The reward — and thus the block's shape — depends on
 * the session's access tier:
 *
 *   - full tier    → unlock weekly GLM 5.2 sessions (carries the live weekly
 *     balance + next reset). Gated on the GLM program flag.
 *   - limited tier → earn a daily free-session bonus (+1/day per qualified
 *     referral, capped). This perk is independent of the GLM program, so it is
 *     NOT gated on the GLM flag.
 *
 * Returns null when the user has no referral code yet — the CLI then simply
 * omits the banner.
 */
export async function getFreebuffReferralInfo(
  userId: string,
  accessTier: FreebuffAccessTier,
): Promise<FreebuffReferralInfo | null> {
  if (accessTier === 'limited') {
    const [identity, stats] = await Promise.all([
      getReferralIdentity(userId),
      getReferralStats({ referrerId: userId }),
    ])
    if (!identity) return null
    return {
      ...identity,
      // The (capped) daily free-session bonus already earned. The CLI knows the
      // cap constant locally to render the "(N/cap)" progress copy.
      qualifiedCount: cliDailySessionBonusFromStats(stats),
    }
  }

  // Full tier: GLM 5.2 weekly reward. Program wound down → omit the banner.
  if (!FREEBUFF_GLM_V52_REFERRAL_ENABLED) return null
  const [identity, weekly] = await Promise.all([
    getReferralIdentity(userId),
    getGlmWeeklyUsage(userId),
  ])
  if (!identity) return null

  return {
    ...identity,
    // The (capped) qualified GLM referral count — the bonus-free entitlement,
    // not the effective limit, so a streak-bonus session never inflates the
    // "(N/cap)" referral copy.
    qualifiedCount: weekly.referralLimit,
    weeklySessionsRemaining: weekly.remaining,
    resetAt: weekly.resetAt,
  }
}
