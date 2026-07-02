import {
  FREEBUFF_REFERRAL_TIERS,
  MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
  getNextReferralTier,
  getReferralTier,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import {
  getReferralFunnelStats,
  getWebReferralScore,
  referredGithubIdSql,
} from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { getReferralLeaderboard } from '@/server/referral-leaderboard'

export const runtime = 'nodejs'

/**
 * Everything the /web/referrals page needs, read from the shared Postgres
 * referral ledger: the user's share code (`user.referral_code`, the same
 * token the CLI program uses), web referral score, current/next tier, the
 * tier table, and recent attributed signups.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [[user], score, funnel, recentReferrals, leaderboard] =
    await Promise.all([
      db
        .select({ referralCode: schema.user.referral_code })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1),
      getWebReferralScore({ userId }),
      // Top of the funnel: unique link clicks + all attributed signups. The
      // "valid" figure is `score` (activated + GitHub-age qualified) below.
      getReferralFunnelStats({ referrerId: userId }),
    // Each signup attributed to this referrer (unified referral_v2 model: one
    // row per referred friend), with just enough GitHub + activation state
    // joined in to explain WHY a row hasn't counted yet — never their identity
    // (see the response mapping below). Revoked referrals are hidden.
    db
      .select({
        activatedAt: schema.referralV2.activated_at,
        createdAt: schema.referralV2.created_at,
        // The referred friend's resolved GitHub id (shared with getReferralStats
        // so the list never disagrees with the score). Null only when the friend
        // has no GitHub linked, OR when their GitHub is already burned by another
        // referral (the resolver's NOT EXISTS guard) — both correctly "uncounted".
        githubUserId: referredGithubIdSql,
        // GitHub server-set account-creation date, for the derived age check.
        githubAccountCreatedAt:
          schema.referralQualification.github_account_created_at,
      })
      .from(schema.referralV2)
      .leftJoin(
        schema.referralQualification,
        sql`${schema.referralQualification.github_user_id} = ${referredGithubIdSql}`,
      )
      .where(
        and(
          eq(schema.referralV2.referrer_id, userId),
          isNull(schema.referralV2.revoked_at),
        ),
      )
      .orderBy(desc(schema.referralV2.created_at))
      .limit(25),
    getReferralLeaderboard(10),
  ])

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // A referral COUNTS only when the friend's GitHub account is old enough AND
  // they've activated by using a product (referral_v2.activated_at). Derive the
  // age bar the same way the score does, so the list never shows "Qualified"
  // for a friend who hasn't actually used Freebuff.
  const ageThreshold = new Date()
  ageThreshold.setMonth(
    ageThreshold.getMonth() - MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
  )

  return NextResponse.json({
    code: user.referralCode,
    qualifiedReferralCount: score,
    // Referrer funnel: unique clicks -> total signups -> valid (qualified)
    // signups. `validSignups` mirrors `qualifiedReferralCount` so the funnel
    // and the tier progress never disagree.
    clickCount: funnel.clicks,
    totalSignups: funnel.totalSignups,
    validSignups: score,
    currentTier: getReferralTier(score),
    nextTier: getNextReferralTier(score),
    tiers: FREEBUFF_REFERRAL_TIERS,
    minGithubAccountAgeMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
    recentReferrals: recentReferrals.map((referral) => {
      const hasGithub = !!referral.githubUserId
      const githubOldEnough =
        !!referral.githubAccountCreatedAt &&
        referral.githubAccountCreatedAt <= ageThreshold
      const activated = !!referral.activatedAt
      const qualified = githubOldEnough && activated
      return {
        status: qualified ? ('completed' as const) : ('pending' as const),
        createdAt: referral.createdAt.getTime(),
        // Why a signup hasn't counted yet — the FIRST unmet requirement, derived
        // for the referrer without revealing who the friend is. Null when
        // qualified, or when we simply can't read the GitHub age yet (awaiting
        // their next sign-in).
        blockedReason: qualified
          ? null
          : !hasGithub
            ? 'no_github'
            : !githubOldEnough
              ? referral.githubAccountCreatedAt
                ? 'account_too_new'
                : null
              : 'needs_activation',
      }
    }),
    leaderboard,
  })
}
