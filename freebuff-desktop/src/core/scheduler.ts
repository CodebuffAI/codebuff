/**
 * The scheduler (§6.2, §9, §13) — the control loop that keeps the machine
 * "always making progress" within two hard ceilings: **concurrency** and the
 * **rolling-24h daily budget**.
 *
 * This module is the pure decision logic: given a snapshot of tasks + the budget
 * state, it decides which tasks to admit to `running`. The engine wires it to the
 * store and the pipeline runner; keeping it pure makes the runaway-guard rules
 * (the most safety-critical part) directly unit-testable.
 */

import { isUnblocked } from './graph'
import type { BudgetLedger, Task, TaskId, TaskStatus } from './types'

export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000

/** Default concurrency cap (§6.2): ~5 task agents at once. */
export const DEFAULT_CONCURRENCY_CAP = 5

/**
 * Tokens still available in the current rolling window. If the window has elapsed
 * the budget is considered fully refreshed (the ledger is rolled lazily on the
 * next `recordUsage`).
 */
export function budgetRemaining(
  ledger: BudgetLedger | null,
  dailyBudget: number,
  now: number,
): number {
  if (!ledger) return dailyBudget
  if (now - ledger.windowStart >= ROLLING_WINDOW_MS) return dailyBudget
  return Math.max(0, dailyBudget - ledger.tokensUsed)
}

export function isBudgetExhausted(
  ledger: BudgetLedger | null,
  dailyBudget: number,
  now: number,
): boolean {
  return budgetRemaining(ledger, dailyBudget, now) <= 0
}

/**
 * Fold token usage into the ledger, rolling the window if it has elapsed.
 * Pure: returns the next ledger rather than mutating.
 */
export function recordUsage(
  ledger: BudgetLedger | null,
  accountId: string,
  tokens: number,
  now: number,
): BudgetLedger {
  if (!ledger || now - ledger.windowStart >= ROLLING_WINDOW_MS) {
    return { accountId, tokensUsed: tokens, windowStart: now }
  }
  return { ...ledger, tokensUsed: ledger.tokensUsed + tokens }
}

export interface AdmissionInput {
  /** All non-terminal tasks for the project. */
  tasks: Task[]
  concurrencyCap: number
  /** When true, no NEW work is admitted; in-flight tasks finish their stage (§13). */
  budgetExhausted: boolean
}

/**
 * Pick the tasks to start now: FIFO among `ready` + unblocked candidates, up to
 * the free concurrency slots, and only while under budget (§9, §13).
 *
 * - "Unblocked" = every parent is merged (§8).
 * - Order is creation order (FIFO) — there is no priority field (§17).
 * - Hitting a ceiling pauses *new* work; it never touches running tasks.
 */
export function selectAdmittable(input: AdmissionInput): TaskId[] {
  const { tasks, concurrencyCap, budgetExhausted } = input
  if (budgetExhausted) return []

  const statusOf = (id: TaskId): TaskStatus | undefined =>
    tasks.find((t) => t.id === id)?.status

  const runningCount = tasks.filter((t) => t.status === 'running').length
  const freeSlots = Math.max(0, concurrencyCap - runningCount)
  if (freeSlots === 0) return []

  const candidates = tasks
    .filter((t) => t.status === 'ready' && isUnblocked(t, statusOf))
    .sort((a, b) => a.createdAt - b.createdAt)

  return candidates.slice(0, freeSlots).map((t) => t.id)
}

/**
 * Proposed tasks are auto-promoted to `ready` (§9). Returns the ids to promote;
 * the engine flips their status. Promotion is unconditional — budget/concurrency
 * gate *execution*, not the backlog (the backlog is unbounded, §9).
 */
export function selectPromotable(tasks: Task[]): TaskId[] {
  // Human-seeded tasks auto-promote and run. Scout proposals stay `proposed` until
  // a human accepts them — a reviewable backlog, so the machine never surprises you
  // with autonomous work or quietly drains the budget (§9, §17 sprawl guard).
  return tasks
    .filter((t) => t.status === 'proposed' && t.origin === 'human')
    .map((t) => t.id)
}
