import { describe, test, expect } from 'bun:test'

import {
  getFreebuffStreakBonusNote,
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
  test('hidden below the 7-day milestone', () => {
    expect(getFreebuffStreakBonusNote({ streak: 0, accessTier: 'full' })).toBeNull()
    expect(getFreebuffStreakBonusNote({ streak: 6, accessTier: 'full' })).toBeNull()
    expect(
      getFreebuffStreakBonusNote({ streak: 6, accessTier: 'limited' }),
    ).toBeNull()
  })

  test('full access advertises the session + GLM perk at 7+', () => {
    const note = getFreebuffStreakBonusNote({ streak: 7, accessTier: 'full' })
    expect(note).toContain('GLM 5.2')
    expect(note).toContain('bonus session')
    // Recurring framing, not a one-off "today" claim.
    expect(note).toContain('each week')
  })

  test('limited access advertises only the session perk', () => {
    const note = getFreebuffStreakBonusNote({ streak: 14, accessTier: 'limited' })
    expect(note).toContain('bonus session')
    expect(note).not.toContain('GLM')
  })
})
