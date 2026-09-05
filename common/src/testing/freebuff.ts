import type { FreebuffFreebucksInfo } from '../types/freebuff-session'

/** A currency snapshot with no paid plan or spend, for client boundary tests. */
export function freebucksFixture(
  balance: number,
  prices: Record<string, number> = { 'z-ai/glm-5.3-flash': 5 },
): FreebuffFreebucksInfo {
  const resetAt = '2026-09-06T07:00:00.000Z'
  return {
    balance,
    daily: { limit: 25, spent: 25 - balance, remaining: balance, resetAt },
    wallet: { balance: 0, monthlyBonus: 0 },
    spend: { limitUsd: 0.5, resetAt },
    planId: null,
    prices,
  }
}
