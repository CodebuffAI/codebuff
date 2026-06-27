// Per-run budget enforcement helpers (P1-5). Single source of truth for the
// lazy-init and post-accumulation check logic used in run-agent-step.ts.
//
// Background: AgentState carries optional maxCostCents / maxTokensPerTurn caps.
// These are lazy-initialized from the agent template on the first step (avoids
// threading config through run-state.ts / initialSessionState and naturally
// handles subagents). After each step's cost/token accumulation, the check
// helper determines whether a cap was exceeded and, if so, produces the
// budget-exceeded system message that ends the turn.
//
// Extracting these as pure functions (rather than inline in run-agent-step.ts)
// lets us unit-test the exact enforcement contract without spinning up the
// full promptAiSdk pipeline. This mirrors the preflight-syntax-validation.ts
// precedent from P0-2.

import type { AgentState } from '@codebuff/common/types/session-state'

/**
 * Shape of the agent template fields that feed budget init. We intentionally
 * use a structural pick rather than importing the full AgentTemplate type so
 * this module stays decoupled from template evolution and is trivially mockable
 * in tests.
 */
export type BudgetCapSource = {
  maxCostCents?: number
  maxTokensPerTurn?: number
}

/**
 * Result of a budget check against the post-accumulation agent state.
 * - `exceeded: false` means the run may continue normally.
 * - `exceeded: true` means the turn must end; `reason` identifies which cap
 *   triggered and `message` is the system message to inject into messageHistory
 *   and stream to the user.
 *
 * Discriminated union: when `exceeded` is true, `reason` and `message` are
 * required (compiler-enforced). Callers use `if (result.exceeded)` for type
 * narrowing — no non-null assertions needed.
 */
export type BudgetCheckResult =
  | { exceeded: false }
  | { exceeded: true; reason: 'cost' | 'tokens'; message: string }

/**
 * Lazy-init per-run budget caps from the agent template onto agentState.
 *
 * Only runs on the first step (when both caps are still undefined on
 * agentState). If the template declares no caps, agentState is returned
 * unchanged. Caps already present on agentState (e.g. set by a prior step, or
 * explicitly by a caller) are preserved — this never overwrites an existing
 * cap.
 *
 * Returns a new agentState object (immutability matches the spread pattern used
 * throughout run-agent-step.ts).
 */
export function initBudgetFromTemplate(
  agentState: AgentState,
  template: BudgetCapSource,
): AgentState {
  // Only init if neither cap is already set. If either is already set, the
  // lazy-init already ran on a prior step — skip to preserve idempotency.
  if (
    agentState.maxCostCents !== undefined ||
    agentState.maxTokensPerTurn !== undefined
  ) {
    return agentState
  }

  // No caps declared on the template — nothing to init.
  if (
    template.maxCostCents === undefined &&
    template.maxTokensPerTurn === undefined
  ) {
    return agentState
  }

  return {
    ...agentState,
    ...(template.maxCostCents !== undefined && {
      maxCostCents: template.maxCostCents,
    }),
    ...(template.maxTokensPerTurn !== undefined && {
      maxTokensPerTurn: template.maxTokensPerTurn,
    }),
  }
}

/**
 * Check whether the post-accumulation agent state exceeds a budget cap.
 *
 * Cost cap: uses the cumulative `creditsUsed` (in US cents, matching the
 * onCostCalculated callback contract). The check is `>=` so that a cap of 0
 * (a degenerate but valid configuration) ends the turn immediately.
 *
 * Token cap: uses the step-local `stepTotalInputTokens` (the count of input
 * tokens processed by the provider in THIS step). This is a per-turn cap, not
 * cumulative — a single oversized step ends the turn. The check is `>` (strict)
 * because exactly hitting the cap is acceptable (the step completed within
 * budget); only exceeding it triggers enforcement.
 *
 * If both caps are exceeded, cost takes precedence in the reported reason
 * (matches the precedence in run-agent-step.ts).
 */
export function checkBudgetExceeded(
  agentState: AgentState,
  stepTotalInputTokens: number,
): BudgetCheckResult {
  const costBudgetExceeded =
    agentState.maxCostCents !== undefined &&
    agentState.creditsUsed >= agentState.maxCostCents

  const tokenBudgetExceeded =
    agentState.maxTokensPerTurn !== undefined &&
    stepTotalInputTokens > agentState.maxTokensPerTurn

  if (!costBudgetExceeded && !tokenBudgetExceeded) {
    return { exceeded: false }
  }

  const reason: 'cost' | 'tokens' = costBudgetExceeded ? 'cost' : 'tokens'
  const message =
    reason === 'cost'
      ? `Agent turn ended: cost budget exceeded ($${(agentState.creditsUsed / 100).toFixed(2)} / $${((agentState.maxCostCents ?? 0) / 100).toFixed(2)}). The task may be incomplete — resume on the next turn if needed.`
      : `Agent turn ended: per-turn token budget exceeded (${stepTotalInputTokens} / ${agentState.maxTokensPerTurn} input tokens). The task may be incomplete — resume on the next turn if needed.`

  return { exceeded: true, reason, message }
}
