import { describe, expect, test } from 'bun:test'

import {
  formatPlanUnits,
  formatPlanWindows,
  freebuffPlanSummary,
} from '../freebuff-plan-summary'

import type { FreebuffSubscriptionInfo } from '../../types/freebuff-session'

const USAGE = {
  dayUsed: 1.3,
  dayLimit: 2,
  fiveDayUsed: 3,
  fiveDayLimit: 6,
  monthUsed: 11,
  monthLimit: 50,
  dayPremiumUsed: 1,
  dayPremiumLimit: 2,
  dayResetAt: '2026-08-29T07:00:00.000Z',
  periodEndsAt: '2026-09-28T16:12:48.000Z',
  monthSpendUsd: 3.21,
  monthSpendLimitUsd: 40,
}

function info(
  overrides: Partial<FreebuffSubscriptionInfo> = {},
): FreebuffSubscriptionInfo {
  return {
    tierId: 'starter',
    tiers: [
      {
        id: 'starter',
        displayName: 'Starter',
        priceUsd: 8,
        firstPeriodPriceUsd: 2.5,
        dailySessions: 2,
        fiveDaySessions: 6,
        monthlySessions: 50,
        monthlySpendLimitUsd: 40,
        dailyPremiumSessions: 2,
        disclaimers: [],
        current: true,
        upgrade: false,
        downgrade: false,
      },
    ],
    usage: USAGE,
    ...overrides,
  }
}

describe('freebuffPlanSummary', () => {
  test('summarises a live plan', () => {
    const s = freebuffPlanSummary(info())!
    expect(s.tierName).toBe('Starter')
    expect(formatPlanWindows(s)).toBe(
      'today 1.3 of 2 · 5-day 3 of 6 · month 11 of 50',
    )
    expect(s.blocked).toBeUndefined()
    expect(s.spend).toEqual({ usedUsd: 3.21, limitUsd: 40 })
  })

  test('absent for no plan, and for a server that omits usage', () => {
    expect(freebuffPlanSummary(undefined)).toBeUndefined()
    expect(freebuffPlanSummary(info({ tierId: null }))).toBeUndefined()
    expect(freebuffPlanSummary(info({ usage: undefined }))).toBeUndefined()
  })

  test('falls back to the raw tier id when the catalog misses it', () => {
    const s = freebuffPlanSummary(
      info({ tiers: [] as FreebuffSubscriptionInfo['tiers'] }),
    )!
    expect(s.tierName).toBe('starter')
  })

  test.each([
    ['daily', USAGE.dayResetAt],
    ['premium_daily', USAGE.dayResetAt],
    ['monthly', USAGE.periodEndsAt],
    ['monthly_spend', USAGE.periodEndsAt],
  ] as const)('blockedBy %s names the binding reset', (blockedBy, resetsAt) => {
    const s = freebuffPlanSummary(info({ blockedBy }))!
    expect(s.blocked?.resetsAt).toBe(resetsAt)
    expect(s.blocked?.label.length).toBeGreaterThan(0)
  })

  test('the rolling 5-day window names no reset instant', () => {
    const s = freebuffPlanSummary(info({ blockedBy: 'five_day' }))!
    expect(s.blocked?.label).toBe('5-day limit reached')
    expect(s.blocked?.resetsAt).toBeUndefined()
  })

  test('formatPlanUnits drops the .0 and keeps one decimal otherwise', () => {
    expect(formatPlanUnits(2)).toBe('2')
    expect(formatPlanUnits(0.5)).toBe('0.5')
    expect(formatPlanUnits(1.2999999)).toBe('1.3')
  })
})
