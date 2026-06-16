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
    db
      .select({
        status: schema.referral.status,
        createdAt: schema.referral.created_at,
      })
      .from(schema.referral)
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
    })),
    leaderboard,
  })
}
