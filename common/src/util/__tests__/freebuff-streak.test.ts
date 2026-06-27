import { describe, expect, test } from 'bun:test'

import {
  addDaysToDateKey,
  calculateFreebuffStreak,
  getFreebuffUsageDateKey,
  isFreebuffStreakMilestone,
  streakRewardPoolsForMilestone,
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

  test('full access milestone grants a premium bonus plus a weekly GLM bonus', () => {
    expect(
      streakRewardPoolsForMilestone({
        streak: 7,
        todayUsed: true,
        accessTier: 'full',
      }),
    ).toEqual(['premium', 'glm'])
  })

  test('limited access milestone grants only a limited bonus', () => {
    expect(
      streakRewardPoolsForMilestone({
        streak: 14,
        todayUsed: true,
        accessTier: 'limited',
      }),
    ).toEqual(['limited'])
  })

  test('no reward off a milestone or before today is used', () => {
    expect(
      streakRewardPoolsForMilestone({
        streak: 6,
        todayUsed: true,
        accessTier: 'full',
      }),
    ).toEqual([])
    // Streak is a multiple of 7 only because yesterday anchored it; the user
    // hasn't used Freebuff today, so the milestone isn't earned yet.
    expect(
      streakRewardPoolsForMilestone({
        streak: 7,
        todayUsed: false,
        accessTier: 'full',
      }),
    ).toEqual([])
  })
})
