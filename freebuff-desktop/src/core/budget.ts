/**
 * Rolling-24h spend bookkeeping. In the thread model this is informational only
 * (the UI shows total spend) — it no longer gates admission of work.
 */

import type { BudgetLedger } from './types'

export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Fold spend into the ledger, rolling the window if it has elapsed.
 * Pure: returns the next ledger rather than mutating.
 */
export function recordUsage(
  ledger: BudgetLedger | null,
  accountId: string,
  amount: number,
  now: number,
): BudgetLedger {
  if (!ledger || now - ledger.windowStart >= ROLLING_WINDOW_MS) {
    return { accountId, tokensUsed: amount, windowStart: now }
  }
  return { ...ledger, tokensUsed: ledger.tokensUsed + amount }
}
