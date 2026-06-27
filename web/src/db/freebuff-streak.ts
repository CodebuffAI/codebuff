import { FREEBUFF_STREAK_BONUS_SESSION_UNITS } from '@codebuff/common/constants/freebuff-models'
import {
  calculateFreebuffStreak,
  getFreebuffUsageDateKey,
  streakRewardPoolsForMilestone,
} from '@codebuff/common/util/freebuff-streak'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type {
  FreebuffAccessTier,
  FreebuffStreakRewardPool,
} from '@codebuff/common/constants/freebuff-models'

/**
 * Record today's usage for the user. Returns true only when this call recorded
 * a NEW usage day (first message of the day) — callers use that to run
 * once-per-day follow-up work without paying for it on every request.
 */
export async function recordFreebuffUsageDay(params: {
  userId: string
  now?: Date
}): Promise<boolean> {
  const now = params.now ?? new Date()
  const usageDate = getFreebuffUsageDateKey(now)

  const inserted = await db
    .insert(schema.freebuffDailyUsage)
    .values({
      user_id: params.userId,
      usage_date: usageDate,
      created_at: now,
    })
    .onConflictDoNothing()
    .returning({ usageDate: schema.freebuffDailyUsage.usage_date })

  return inserted.length > 0
}

export async function listFreebuffUsageDatesForUser(params: {
  userId: string
}): Promise<string[]> {
  const rows = await db
    .select({ usageDate: schema.freebuffDailyUsage.usage_date })
    .from(schema.freebuffDailyUsage)
    .where(eq(schema.freebuffDailyUsage.user_id, params.userId))
    .orderBy(desc(schema.freebuffDailyUsage.usage_date))

  return rows.map((row) => row.usageDate)
}

/**
 * Award streak-milestone bonus sessions for `userId`. Called once per new usage
 * day (right after the day is recorded) so the streak is current. When the
 * resulting streak crosses a multiple of FREEBUFF_STREAK_REWARD_INTERVAL_DAYS
 * (7, 14, …) the user earns one bonus session in each pool returned by
 * `streakRewardPoolsForMilestone` (premium + weekly GLM for full access, limited
 * for limited access). Idempotent: keyed on the milestone's Pacific usage-date
 * so repeated/concurrent calls on the same day insert at most one row per pool.
 * Best-effort — callers should not block the request on it.
 *
 * Returns the streak that was evaluated (for logging / tests).
 */
export async function awardFreebuffStreakRewards(params: {
  userId: string
  accessTier: FreebuffAccessTier
  now?: Date
}): Promise<{ streak: number; awarded: boolean }> {
  const now = params.now ?? new Date()
  const todayDateKey = getFreebuffUsageDateKey(now)
  const usageDates = await listFreebuffUsageDatesForUser({
    userId: params.userId,
  })
  const { streak, todayUsed } = calculateFreebuffStreak({
    usageDates,
    todayDateKey,
  })

  const pools = streakRewardPoolsForMilestone({
    streak,
    todayUsed,
    accessTier: params.accessTier,
  })
  if (pools.length === 0) return { streak, awarded: false }

  const sessionUnits = FREEBUFF_STREAK_BONUS_SESSION_UNITS.toFixed(1)
  const inserted = await db
    .insert(schema.freebuffStreakReward)
    .values(
      pools.map((pool) => ({
        user_id: params.userId,
        pool,
        reward_key: todayDateKey,
        session_units: sessionUnits,
        awarded_at: now,
        created_at: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: schema.freebuffStreakReward.id })

  return { streak, awarded: inserted.length > 0 }
}

/**
 * Sum of unredeemed streak-bonus session units for `userId` in `pool` whose
 * award landed at/after `since` (the current pool period's start). Folded into
 * the pool's effective session limit by the free-session quota gate, so a
 * milestone reached today raises today's premium/limited cap (or this week's GLM
 * cap) by one session.
 */
export async function sumStreakBonusUnits(params: {
  userId: string
  pool: FreebuffStreakRewardPool
  since: Date
}): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string | null>`sum(${schema.freebuffStreakReward.session_units})`,
    })
    .from(schema.freebuffStreakReward)
    .where(
      and(
        eq(schema.freebuffStreakReward.user_id, params.userId),
        eq(schema.freebuffStreakReward.pool, params.pool),
        gte(schema.freebuffStreakReward.awarded_at, params.since),
      ),
    )
  const total = Number(row?.total ?? 0)
  return Number.isFinite(total) ? Math.round(total * 10) / 10 : 0
}
