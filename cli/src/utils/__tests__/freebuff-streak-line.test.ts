import { describe, test, expect } from 'bun:test'

import {
  getFreebuffStreakBonusNote,
  getFreebuffStreakBonusNoteForLayout,
  getFreebuffStreakLine,
} from '../freebuff-streak-line'

describe('getFreebuffStreakLine', () => {
  test('hides the row for new / lapsed users (streak <= 0)', () => {
    expect(getFreebuffStreakLine(0)).toBeNull()
    expect(getFreebuffStreakLine(-1)).toBeNull()
  })

  test('labels and fills dots for an active streak', () => {
    expect(getFreebuffStreakLine(2)).toEqual({
      label: '2 day streak',
      dots: '●●○○○○○',
    })
  })

  test('"day" stays singular as a compound modifier', () => {
    expect(getFreebuffStreakLine(1)?.label).toBe('1 day streak')
    expect(getFreebuffStreakLine(5)?.label).toBe('5 day streak')
  })

  test('fills the whole week on a 7-day milestone', () => {
    expect(getFreebuffStreakLine(7)).toEqual({
      label: '7 day streak',
      dots: '●●●●●●●',
    })
  })

  test('stays full and gains a "+" once the streak passes the week', () => {
    expect(getFreebuffStreakLine(9)).toEqual({
      label: '9 day streak',
      dots: '●●●●●●●+',
    })
    expect(getFreebuffStreakLine(19)).toEqual({
      label: '19 day streak',
      dots: '●●●●●●●+',
    })
  })
})

describe('getFreebuffStreakBonusNote', () => {
  test('hidden with no streak at all', () => {
    expect(
      getFreebuffStreakBonusNote({ streak: 0, accessTier: 'full' }),
    ).toBeNull()
    expect(
      getFreebuffStreakBonusNote({ streak: -1, accessTier: 'limited' }),
    ).toBeNull()
  })

  test('teases the unlock countdown below the 7-day milestone', () => {
    expect(getFreebuffStreakBonusNote({ streak: 3, accessTier: 'full' })).toBe(
      '🎁 4 more days to unlock +1 bonus session every day + 1 GLM 5.2 session each day',
    )
    expect(
      getFreebuffStreakBonusNote({ streak: 3, accessTier: 'limited' }),
    ).toBe('🎁 4 more days to unlock +1 bonus session every day')
  })

  test('"day" goes singular on the eve of the milestone', () => {
    expect(
      getFreebuffStreakBonusNote({ streak: 6, accessTier: 'limited' }),
    ).toBe('🎁 1 more day to unlock +1 bonus session every day')
  })

  test('full access advertises the daily session + daily GLM perk at 7+', () => {
    const note = getFreebuffStreakBonusNote({ streak: 7, accessTier: 'full' })
    expect(note).toBe(
      '🎁 Streak perk: +1 bonus session every day + 1 GLM 5.2 session each day',
    )
  })

  test('the GLM streak count grows per completed 7 days, capped at 4', () => {
    expect(getFreebuffStreakBonusNote({ streak: 14, accessTier: 'full' })).toBe(
      '🎁 Streak perk: +1 bonus session every day + 2 GLM 5.2 sessions each day',
    )
    expect(getFreebuffStreakBonusNote({ streak: 35, accessTier: 'full' })).toBe(
      '🎁 Streak perk: +1 bonus session every day + 4 GLM 5.2 sessions each day',
    )
  })

  test('limited access advertises only the daily session perk', () => {
    const note = getFreebuffStreakBonusNote({
      streak: 14,
      accessTier: 'limited',
    })
    expect(note).toBe('🎁 Streak perk: +1 bonus session every day')
  })
})

describe('getFreebuffStreakBonusNoteForLayout', () => {
  const params = {
    streak: 7,
    accessTier: 'full' as const,
  }
  const note = getFreebuffStreakBonusNote(params)!

  test('hides the unlock countdown before the bonus is earned', () => {
    expect(
      getFreebuffStreakBonusNoteForLayout({
        ...params,
        streak: 6,
        terminalHeight: 30,
        availableWidth: 200,
      }),
    ).toBeNull()
  })

  test('hides the earned note below 30 rows', () => {
    expect(
      getFreebuffStreakBonusNoteForLayout({
        ...params,
        terminalHeight: 29,
        availableWidth: note.length,
      }),
    ).toBeNull()
  })

  test('shows the earned note at 30 rows when it fits on one line', () => {
    expect(
      getFreebuffStreakBonusNoteForLayout({
        ...params,
        terminalHeight: 30,
        availableWidth: note.length,
      }),
    ).toBe(note)
  })

  test('hides the earned note when it would wrap', () => {
    expect(
      getFreebuffStreakBonusNoteForLayout({
        ...params,
        terminalHeight: 30,
        availableWidth: note.length - 1,
      }),
    ).toBeNull()
  })
})
