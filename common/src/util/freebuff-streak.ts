import {
  FREEBUFF_GLM_V52_REFERRAL_ENABLED,
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE,
  FREEBUFF_STREAK_GLM_BONUS_ENABLED,
  FREEBUFF_STREAK_REWARD_INTERVAL_DAYS,
  FREEBUFF_STREAK_REWARDS_ENABLED,
} from '../constants/freebuff-models'

import type {
  FreebuffAccessTier,
  FreebuffStreakRewardPool,
} from '../constants/freebuff-models'

export const FREEBUFF_STREAK_TIME_ZONE = FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE

const DAY_MS = 24 * 60 * 60 * 1000

function dateKeyFromParts(parts: Intl.DateTimeFormatPart[]): string {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value

  const year = get('year')
  const month = get('month')
  const day = get('day')

  if (!year || !month || !day) {
    throw new Error('Failed to format Freebuff usage date')
  }

  return `${year}-${month}-${day}`
}

export function getFreebuffUsageDateKey(
  now: Date = new Date(),
  timeZone = FREEBUFF_STREAK_TIME_ZONE,
): string {
  return dateKeyFromParts(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now),
  )
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date key: ${dateKey}`)
  }

  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

export function calculateFreebuffStreak(params: {
  usageDates: readonly string[]
  todayDateKey: string
}): {
  streak: number
  todayUsed: boolean
  lastUsageDate: string | null
} {
  const { usageDates, todayDateKey } = params
  const usageDateSet = new Set(
    usageDates.filter((date) => date <= todayDateKey),
  )
  const lastUsageDate = usageDates.reduce<string | null>((latest, date) => {
    if (date > todayDateKey) return latest
    return latest === null || date > latest ? date : latest
  }, null)
  const todayUsed = usageDateSet.has(todayDateKey)

  let anchorDateKey = todayDateKey
  if (!todayUsed) {
    const yesterdayDateKey = addDaysToDateKey(todayDateKey, -1)
    if (!usageDateSet.has(yesterdayDateKey)) {
      return { streak: 0, todayUsed, lastUsageDate }
    }
    anchorDateKey = yesterdayDateKey
  }

  let streak = 0
  for (
    let cursor = anchorDateKey;
    usageDateSet.has(cursor);
    cursor = addDaysToDateKey(cursor, -1)
  ) {
    streak++
  }

  return { streak, todayUsed, lastUsageDate }
}

/** True when `streak` lands exactly on a streak-reward milestone (a positive
 *  multiple of the 7-day interval). */
export function isFreebuffStreakMilestone(streak: number): boolean {
  return streak > 0 && streak % FREEBUFF_STREAK_REWARD_INTERVAL_DAYS === 0
}

/**
 * Whether the full-access GLM 5.2 streak bonus is currently active. Requires all
 * three switches: streak rewards on, the GLM streak sub-switch on, AND the GLM
 * program itself live — GLM is only launchable from the referral banner, which
 * is hidden when the referral program is wound down, so a GLM bonus granted
 * while it's off would be unusable. Keeping the grant and the advertised perk
 * gated on the same predicate avoids that mismatch.
 */
export function isFreebuffStreakGlmBonusActive(): boolean {
  return (
    FREEBUFF_STREAK_REWARDS_ENABLED &&
    FREEBUFF_STREAK_GLM_BONUS_ENABLED &&
    FREEBUFF_GLM_V52_REFERRAL_ENABLED
  )
}

/**
 * The streak-reward pools to grant a bonus session in for today's usage, or `[]`
 * when nothing should be awarded. Two cadences:
 *
 *   - Daily pool (`premium` for full access, `limited` for limited access):
 *     granted **every day** the streak is at/above the 7-day milestone, so a
 *     sustained streak is worth +1 session on the primary daily pool every day
 *     it's kept up — not just on the exact 7/14/21 milestone days.
 *   - GLM (`glm`, full access only): a **weekly** perk, so it's granted only on
 *     the days the streak lands exactly on a 7-day multiple. Milestones are 7
 *     days apart and the GLM pool is a Pacific week, so this yields exactly one
 *     GLM session per week.
 *
 * Returns `[]` when rewards are disabled, today isn't used yet, or the streak is
 * below the milestone.
 */
export function streakRewardPools(params: {
  streak: number
  todayUsed: boolean
  accessTier: FreebuffAccessTier
}): FreebuffStreakRewardPool[] {
  if (!FREEBUFF_STREAK_REWARDS_ENABLED) return []
  if (!params.todayUsed) return []
  if (params.streak < FREEBUFF_STREAK_REWARD_INTERVAL_DAYS) return []
  // Daily pool bonus: every day at streak >= 7.
  if (params.accessTier === 'limited') return ['limited']
  const pools: FreebuffStreakRewardPool[] = ['premium']
  // GLM stays weekly: only on the exact milestone day (once per Pacific week).
  if (isFreebuffStreakMilestone(params.streak) && isFreebuffStreakGlmBonusActive()) {
    pools.push('glm')
  }
  return pools
}
