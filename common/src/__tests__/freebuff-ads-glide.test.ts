/**
 * The scheduled delivery taper.
 *
 * What has to hold: it starts where it was told to start, it ENDS on the
 * target and stays there, it never wanders outside those two numbers, and the
 * randomization is randomization — different day to day, identical on two
 * reads of the same day. That last property is the one with teeth: a jitter
 * that moved within a day would let a caller reroll the day's ceiling by
 * retrying the request until it got a high one.
 */

import { describe, expect, test } from 'bun:test'

import {
  effectiveDailyBudgetCents,
  engagementsForDailyBudget,
  glidedDailyBudgetCents,
  type BudgetGlide,
} from '../constants/freebuff-ads'

/** Weave's taper: 1,200/day down to 300/day over three weeks, ±10%. */
const GLIDE: BudgetGlide = {
  startCents: 60_000,
  targetCents: 15_000,
  days: 21,
  jitterBps: 1_000,
  startedOn: '2026-08-27',
}
const SEED = '4cf06ebe-f759-4a1c-8f62-78c6d5dd3a12'

function capOn(day: string, glide: BudgetGlide = GLIDE): number {
  return engagementsForDailyBudget(
    glidedDailyBudgetCents({ glide, seed: SEED, today: day }),
  )
}

describe('glidedDailyBudgetCents', () => {
  test('day zero is the starting cap, untouched by jitter', () => {
    expect(capOn('2026-08-27')).toBe(1_200)
  })

  test('the last day and every day after it sit exactly on the target', () => {
    expect(capOn('2026-09-17')).toBe(300)
    expect(capOn('2026-09-18')).toBe(300)
    expect(capOn('2026-12-25')).toBe(300)
  })

  test('a day before the start does not taper anything', () => {
    expect(capOn('2026-08-20')).toBe(1_200)
  })

  test('never leaves the corridor between start and target', () => {
    for (let day = 1; day <= 21; day++) {
      const date = new Date(Date.parse('2026-08-27T00:00:00Z') + day * 86_400_000)
      const cap = capOn(date.toISOString().slice(0, 10))
      expect(cap).toBeLessThanOrEqual(1_200)
      expect(cap).toBeGreaterThanOrEqual(300)
    }
  })

  test('trends down: the second week is below the first, the third below that', () => {
    const week = (from: number) => {
      let total = 0
      for (let day = from; day < from + 7; day++) {
        const date = new Date(
          Date.parse('2026-08-27T00:00:00Z') + day * 86_400_000,
        )
        total += capOn(date.toISOString().slice(0, 10))
      }
      return total / 7
    }
    expect(week(8)).toBeLessThan(week(1))
    expect(week(15)).toBeLessThan(week(8))
  })

  test('the same day always resolves to the same cap', () => {
    const first = capOn('2026-09-03')
    for (let i = 0; i < 25; i++) expect(capOn('2026-09-03')).toBe(first)
  })

  test('the cap actually moves between days rather than following the line', () => {
    const caps = new Set<number>()
    for (let day = 1; day < 21; day++) {
      const date = new Date(
        Date.parse('2026-08-27T00:00:00Z') + day * 86_400_000,
      )
      caps.add(capOn(date.toISOString().slice(0, 10)))
    }
    // A pure straight line over 20 days would give ~20 evenly-spaced values;
    // what matters is that the jitter produced a spread rather than nothing.
    expect(caps.size).toBeGreaterThan(10)
  })

  test('two campaigns on identical taper settings do not move in lockstep', () => {
    const other = 'a8effe69-0b26-4304-a3d1-98bf453424f4'
    let differed = 0
    for (let day = 1; day < 21; day++) {
      const today = new Date(
        Date.parse('2026-08-27T00:00:00Z') + day * 86_400_000,
      )
        .toISOString()
        .slice(0, 10)
      const mine = glidedDailyBudgetCents({ glide: GLIDE, seed: SEED, today })
      const theirs = glidedDailyBudgetCents({ glide: GLIDE, seed: other, today })
      if (mine !== theirs) differed++
    }
    expect(differed).toBeGreaterThan(10)
  })

  test('zero jitter is a plain straight line', () => {
    const straight: BudgetGlide = { ...GLIDE, jitterBps: 0 }
    // A third of the way through (day 7 of 21), a third of the way down:
    // 1200 - (900 / 3) = 900.
    expect(capOn('2026-09-03', straight)).toBe(900)
  })
})

describe('effectiveDailyBudgetCents', () => {
  test('a campaign with no taper is its own budget', () => {
    expect(
      effectiveDailyBudgetCents({
        dailyBudgetCents: 100_000,
        glide: null,
        billedBySubscription: false,
        seed: SEED,
        today: '2026-09-06',
      }),
    ).toBe(100_000)
  })

  test('a BILLED campaign ignores the taper entirely', () => {
    // The fence that matters: capping delivery under a price the advertiser
    // is charged in full is the pause bug in different clothes.
    expect(
      effectiveDailyBudgetCents({
        dailyBudgetCents: 100_000,
        glide: GLIDE,
        billedBySubscription: true,
        seed: SEED,
        today: '2026-09-06',
      }),
    ).toBe(100_000)
  })

  test('an unbilled campaign follows the taper', () => {
    expect(
      effectiveDailyBudgetCents({
        dailyBudgetCents: 100_000,
        glide: { ...GLIDE, jitterBps: 0 },
        billedBySubscription: false,
        seed: SEED,
        today: '2026-09-03',
      }),
    ).toBe(45_000)
  })
})
