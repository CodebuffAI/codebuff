import {
  FREEBUFF_REFERRAL_TIERS,
  MIN_GITHUB_ACCOUNT_AGE_MONTHS,
  getNextReferralTier,
  getReferralTier,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import { getReferralScore } from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, desc, eq } from 'drizzle-orm'
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

  const [[user], score, recentReferrals, leaderboard] = await Promise.all([
    db
      .select({ referralCode: schema.user.referral_code })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
    getReferralScore({ userId, program: 'web' }),
    // Each signup attributed to this referrer, with just enough of the referred
    // user's GitHub qualification joined in to explain WHY a pending row hasn't
    // qualified yet — never their identity (see the response mapping below).
    db
      .select({
        status: schema.referral.status,
        createdAt: schema.referral.created_at,
        // Null when the friend has no GitHub account linked at all.
        githubAccountId: schema.account.providerAccountId,
        // Last cached qualification reason for that GitHub identity.
        qualReason: schema.referralQualification.reason,
      })
      .from(schema.referral)
      .leftJoin(
        schema.account,
        and(
          eq(schema.account.userId, schema.referral.referred_id),
          eq(schema.account.provider, 'github'),
        ),
      )
      .leftJoin(
        schema.referralQualification,
        eq(
          schema.referralQualification.github_user_id,
          schema.account.providerAccountId,
        ),
      )
      .where(
        and(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.program, 'web'),
        ),
      )
      .orderBy(desc(schema.referral.created_at))
      .limit(25),
    getReferralLeaderboard(10),
  ])

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    code: user.referralCode,
    qualifiedReferralCount: score,
    currentTier: getReferralTier(score),
    nextTier: getNextReferralTier(score),
    tiers: FREEBUFF_REFERRAL_TIERS,
    minGithubAccountAgeMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS,
    recentReferrals: recentReferrals.map((referral) => ({
      status: referral.status,
      createdAt: referral.createdAt.getTime(),
      // Why a pending signup hasn't qualified yet, derived for the referrer
      // without revealing who the friend is. Null when already qualified or
      // when it's simply awaiting the friend's next sign-in (no known block).
      blockedReason:
        referral.status === 'completed'
          ? null
          : !referral.githubAccountId
            ? 'no_github'
            : referral.qualReason === 'account_too_new'
              ? 'account_too_new'
              : null,
    })),
    leaderboard,
  })
}
