import { describe, expect, test } from 'bun:test'

import {
  addDaysToDateKey,
  calculateFreebuffStreak,
  getFreebuffUsageDateKey,
  isFreebuffStreakMilestone,
  streakRewardPools,
} from '../freebuff-streak'

describe('freebuff streak helpers', () => {
  test('formats usage dates in the Freebuff reset timezone', () => {
    expect(getFreebuffUsageDateKey(new Date('2026-05-27T06:30:00.000Z'))).toBe(
      '2026-05-26',
    )
    expect(getFreebuffUsageDateKey(new Date('2026-05-27T08:30:00.000Z'))).toBe(
      '2026-05-27',
    )
  })

  test('adds days across month boundaries', () => {
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysToDateKey('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('counts a streak that includes today', () => {
    expect(
      calculateFreebuffStreak({
        todayDateKey: '2026-05-27',
        usageDates: ['2026-05-25', '2026-05-23', '2026-05-27', '2026-05-26'],
      }),
    ).toEqual({
      streak: 3,
      todayUsed: true,
      lastUsageDate: '2026-05-27',
    })
  })

  test('keeps yesterday-anchored streaks alive before today is used', () => {
    expect(
      calculateFreebuffStreak({
        todayDateKey: '2026-05-27',
        usageDates: ['2026-05-26', '2026-05-25', '2026-05-24'],
      }),
    ).toEqual({
      streak: 3,
      todayUsed: false,
      lastUsageDate: '2026-05-26',
    })
  })

  test('returns zero after a missed full day', () => {
    expect(
      calculateFreebuffStreak({
        todayDateKey: '2026-05-27',
        usageDates: ['2026-05-25', '2026-05-24'],
      }),
    ).toEqual({
      streak: 0,
      todayUsed: false,
      lastUsageDate: '2026-05-25',
    })
  })
})

describe('freebuff streak rewards', () => {
  test('recognizes 7-day multiples as milestones', () => {
    expect(isFreebuffStreakMilestone(7)).toBe(true)
    expect(isFreebuffStreakMilestone(14)).toBe(true)
    expect(isFreebuffStreakMilestone(21)).toBe(true)
    expect(isFreebuffStreakMilestone(0)).toBe(false)
    expect(isFreebuffStreakMilestone(6)).toBe(false)
    expect(isFreebuffStreakMilestone(8)).toBe(false)
  })

  test('full access milestone day grants a premium bonus plus a weekly GLM bonus', () => {
    expect(
      streakRewardPools({
        streak: 7,
        todayUsed: true,
        accessTier: 'full',
      }),
    ).toEqual(['premium', 'glm'])
  })

  test('full access grants the daily premium bonus on non-milestone days too (no GLM)', () => {
    // Streak >= 7 but not a 7-day multiple: the daily premium bonus still lands
    // every day, but GLM is weekly so it only lands on the milestone days.
    expect(
      streakRewardPools({
        streak: 8,
        todayUsed: true,
        accessTier: 'full',
      }),
    ).toEqual(['premium'])
    expect(
      streakRewardPools({
        streak: 13,
        todayUsed: true,
        accessTier: 'full',
      }),
    ).toEqual(['premium'])
  })

  test('limited access grants the limited bonus every day at streak >= 7', () => {
    // Milestone day and a plain day between milestones both grant the bonus.
    expect(
      streakRewardPools({
        streak: 14,
        todayUsed: true,
        accessTier: 'limited',
      }),
    ).toEqual(['limited'])
    expect(
      streakRewardPools({
        streak: 9,
        todayUsed: true,
        accessTier: 'limited',
      }),
    ).toEqual(['limited'])
  })

  test('no reward below the milestone or before today is used', () => {
    expect(
      streakRewardPools({
        streak: 6,
        todayUsed: true,
        accessTier: 'full',
      }),
    ).toEqual([])
    // Streak is at 7 only because yesterday anchored it; the user hasn't used
    // Freebuff today, so no bonus is earned yet.
    expect(
      streakRewardPools({
        streak: 7,
        todayUsed: false,
        accessTier: 'full',
      }),
    ).toEqual([])
  })
})
