import { describe, expect, test } from 'bun:test'

import { getZonedDayBounds, getZonedWeekBounds } from '../zoned-time'

describe('getZonedDayBounds', () => {
  test('returns the current Pacific day bounds on a normal day', () => {
    const bounds = getZonedDayBounds(
      new Date('2026-04-17T16:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-04-17T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-04-18T07:00:00.000Z')
  })

  test('handles the shorter spring-forward Pacific day', () => {
    const bounds = getZonedDayBounds(
      new Date('2026-03-08T09:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-03-08T08:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-03-09T07:00:00.000Z')
  })

  test('handles the longer fall-back Pacific day', () => {
    const bounds = getZonedDayBounds(
      new Date('2026-11-01T09:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-11-02T08:00:00.000Z')
  })
})

describe('getZonedWeekBounds', () => {
  // The week is Monday-anchored by default. 2026-04-17 is a Friday; its week
  // starts Monday 2026-04-13 and resets the following Monday 2026-04-20, both at
  // Pacific midnight (07:00Z during PDT).
  test('returns Monday→Monday Pacific bounds for a mid-week day', () => {
    const bounds = getZonedWeekBounds(
      new Date('2026-04-17T16:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-04-13T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-04-20T07:00:00.000Z')
  })

  test('groups Sunday into the week that started the prior Monday', () => {
    // 2026-04-19 is the Sunday of the same week, so it must yield identical
    // bounds to the Friday case (Sunday is the LAST day of a Monday-week).
    const bounds = getZonedWeekBounds(
      new Date('2026-04-19T18:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-04-13T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-04-20T07:00:00.000Z')
  })

  test('handles the spring-forward week (start in PST, reset in PDT)', () => {
    // 2026-03-08 (DST switch day) is a Sunday; its week started Monday
    // 2026-03-02 at PST midnight (08:00Z) and resets Monday 2026-03-09 at PDT
    // midnight (07:00Z) — the week itself is one hour short.
    const bounds = getZonedWeekBounds(
      new Date('2026-03-08T18:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-03-02T08:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-03-09T07:00:00.000Z')
  })

  test('honors a Sunday week start when requested', () => {
    // weekStartsOn=0 → the Friday 2026-04-17 belongs to the week starting
    // Sunday 2026-04-12.
    const bounds = getZonedWeekBounds(
      new Date('2026-04-17T16:00:00Z'),
      'America/Los_Angeles',
      0,
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-04-12T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-04-19T07:00:00.000Z')
  })
})
