import { FREEBUFF_GLM_V52_REFERRAL_ENABLED } from '@codebuff/common/constants/freebuff-models'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq } from 'drizzle-orm'

import { getGlmWeeklyUsage } from './public-api'

import type { FreebuffReferralInfo } from '@codebuff/common/types/freebuff-session'

/**
 * Assemble the referral block the CLI model-selector renders to advertise the
 * "invite friends → unlock GLM 5.2" reward. Combines the user's share code, a
 * GitHub-linked flag (Google-only users are prompted to connect one so their
 * referral can qualify), and their live weekly GLM session balance.
 *
 * Returns null when the user has no referral code yet (every user gets one on
 * signup, so this is rare) — the CLI then simply omits the banner.
 */
export async function getFreebuffReferralInfo(
  userId: string,
): Promise<FreebuffReferralInfo | null> {
  // Program wound down: omit the block entirely so the CLI shows no banner.
  if (!FREEBUFF_GLM_V52_REFERRAL_ENABLED) return null
  const [[userRow], [githubAccount], weekly] = await Promise.all([
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
    getGlmWeeklyUsage(userId),
  ])

  const code = userRow?.referralCode
  if (!code) return null

  return {
    code,
    // Prefer the display name; fall back to the GitHub login (handle) so
    // GitHub-only users with no name set still personalize the invite page.
    referrerName:
      userRow?.name?.trim() || githubAccount?.githubLogin?.trim() || null,
    // The (capped) qualified GLM referral count — the bonus-free entitlement,
    // not the effective limit, so a streak-bonus session never inflates the
    // "(N/cap)" referral copy.
    qualifiedCount: weekly.referralLimit,
    weeklySessionsRemaining: weekly.remaining,
    resetAt: weekly.resetAt,
    githubLinked: Boolean(githubAccount),
  }
}
