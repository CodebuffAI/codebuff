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
      .select({ referralCode: schema.user.referral_code })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
    db
      .select({ provider: schema.account.provider })
      .from(schema.account)
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
    // The weekly limit IS the (capped) qualified GLM referral count.
    qualifiedCount: weekly.limit,
    weeklySessionsRemaining: weekly.remaining,
    resetAt: weekly.resetAt,
    githubLinked: Boolean(githubAccount),
  }
}
