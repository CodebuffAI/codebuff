import { fetchQuery } from 'convex/nextjs'
import { sql, desc, eq, and } from 'drizzle-orm'

import { api } from '@/convex/_generated/api'

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'

export type ReferralLeaderboardEntry = {
  userId: string
  name: string
  profileImage?: string
  referrals: number
  rank: number
  communityUserId?: string
  isPaidUser: boolean
  communityBadgeTier: number
  followersCount: number
  followingCount: number
  postsCount: number
  totalLikesReceived: number
}

type CommunityProfile = {
  freebuffUserId: string
  userId?: string
  name: string
  profileImage?: string
  isPaidUser: boolean
  communityBadgeTier: number
  followersCount: number
  followingCount: number
  postsCount: number
  totalLikesReceived: number
}

const MAX_LEADERBOARD_LIMIT = 50

export async function getReferralLeaderboard(limit = 10) {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_LEADERBOARD_LIMIT)

  const rows = await db
    .select({
      userId: schema.referral.referrer_id,
      name: schema.user.name,
      profileImage: schema.user.image,
      referrals: sql<number>`count(*)::int`,
    })
    .from(schema.referral)
    .innerJoin(schema.user, eq(schema.user.id, schema.referral.referrer_id))
    .where(
      and(
        eq(schema.referral.program, 'web'),
        sql`${schema.referral.qualified_at} IS NOT NULL`,
      ),
    )
    .groupBy(schema.referral.referrer_id, schema.user.name, schema.user.image)
    .orderBy(desc(sql`count(*)`))
    .limit(boundedLimit)

  const communityProfiles = await fetchCommunityProfiles(
    rows.map((row) => row.userId),
  )
  const communityProfileByFreebuffId = new Map(
    communityProfiles.map((profile) => [profile.freebuffUserId, profile]),
  )

  return rows.map((row, index): ReferralLeaderboardEntry => {
    const profile = communityProfileByFreebuffId.get(row.userId)
    return {
      userId: row.userId,
      name: profile?.name ?? row.name ?? 'Anonymous',
      profileImage: profile?.profileImage ?? row.profileImage ?? undefined,
      referrals: Number(row.referrals) || 0,
      rank: index + 1,
      communityUserId: profile?.userId,
      isPaidUser: profile?.isPaidUser ?? false,
      communityBadgeTier: profile?.communityBadgeTier ?? 0,
      followersCount: profile?.followersCount ?? 0,
      followingCount: profile?.followingCount ?? 0,
      postsCount: profile?.postsCount ?? 0,
      totalLikesReceived: profile?.totalLikesReceived ?? 0,
    }
  })
}

async function fetchCommunityProfiles(
  freebuffUserIds: string[],
): Promise<CommunityProfile[]> {
  if (freebuffUserIds.length === 0) return []

  try {
    return (await fetchQuery(api.community.getCommunityProfilesByFreebuffUserIds, {
      freebuffUserIds,
    })) as CommunityProfile[]
  } catch (error) {
    console.warn('[referral-leaderboard] Failed to fetch community profiles', error)
    return []
  }
}
