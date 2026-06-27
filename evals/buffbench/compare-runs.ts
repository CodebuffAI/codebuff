/**
 * Pure before/after comparison for the eval→optimization closed loop (P1-4).
 *
 * The existing `meta-analyzer.ts` compares agents against EACH OTHER within a
 * single run (cross-agent patterns). This module compares the SAME agents
 * across TWO runs (before vs after applying proposals from lessons-extractor).
 *
 * Workflow: run BuffBench (before) → lessons-extractor emits proposals →
 * applyProposals (dryRun, review, apply) → run BuffBench again (after) →
 * compareRuns(before, after) → decide whether the proposals helped.
 *
 * Pure: takes two `AgentEvalResults[]` and returns a delta report. No I/O, no
 * LLM calls. This makes it trivially testable (see compare-runs.test.ts).
 */

import type { AgentEvalResults } from './types'

/**
 * Per-agent delta between before and after runs. Positive `scoreDelta` means
 * the after run scored higher. Negative `costDelta` means the after run was
 * cheaper. `regression` flags agents where score dropped OR cost increased
 * significantly without a score gain.
 */
export interface AgentRunDelta {
  agentId: string
  /** Change in average score (after - before). Positive is better. */
  scoreDelta: number
  /** Change in average score excluding failures (after - before). */
  scoreExcludingFailuresDelta: number
  /** Change in average cost in cents (after - before). Negative is better. */
  costDelta: number
  /** Change in average duration in ms (after - before). Negative is better. */
  durationDelta: number
  /** Change in the number of runs that errored (after - before). */
  errorCountDelta: number
  /** Number of before runs for this agent. */
  beforeRunCount: number
  /** Number of after runs for this agent. */
  afterRunCount: number
  /** True if the after run is worse on score or cost-without-score-gain. */
  regression: boolean
  /** Human-readable one-line summary, e.g. "score +0.8, cost -12c, 5→5 runs". */
  summary: string
}

export interface ComparisonResult {
  /** One delta per agent present in either before or after (union of agentIds). */
  agentDeltas: AgentRunDelta[]
  /** Aggregate across all agents (simple sum of per-agent deltas). */
  overall: {
    totalScoreDelta: number
    totalCostDelta: number
    totalDurationDelta: number
    totalErrorDelta: number
    totalBeforeRuns: number
    totalAfterRuns: number
    /** Agents that regressed. */
    regressedAgentIds: string[]
    /** Agents that improved (score increased without a cost explosion). */
    improvedAgentIds: string[]
  }
  /** True if any agent regressed. */
  hasRegressions: boolean
}

/**
 * Compare two BuffBench runs. Agents present in only one of the two runs are
 * included with a delta computed against the missing side treated as zero
 * (and flagged as a regression if they disappeared, or as new if they only
 * appear in after).
 *
 * Cost is in cents (matching AgentEvalResults.averageCost). A cost of 0 in
 * the "before" run for an agent that appears only in "after" is treated as
 * "new agent" rather than a regression.
 */
export function compareRuns(
  before: AgentEvalResults[],
  after: AgentEvalResults[],
): ComparisonResult {
  const beforeById = new Map(before.map((r) => [r.agentId, r]))
  const afterById = new Map(after.map((r) => [r.agentId, r]))
  const allAgentIds = new Set([...beforeById.keys(), ...afterById.keys()])

  const agentDeltas: AgentRunDelta[] = []
  let totalScoreDelta = 0
  let totalCostDelta = 0
  let totalDurationDelta = 0
  let totalErrorDelta = 0
  let totalBeforeRuns = 0
  let totalAfterRuns = 0
  const regressedAgentIds: string[] = []
  const improvedAgentIds: string[] = []

  for (const agentId of allAgentIds) {
    const beforeResult = beforeById.get(agentId)
    const afterResult = afterById.get(agentId)

    const beforeRunCount = beforeResult?.runs.length ?? 0
    const afterRunCount = afterResult?.runs.length ?? 0
    const beforeErrors = beforeResult?.runs.filter((r) => r.error).length ?? 0
    const afterErrors = afterResult?.runs.filter((r) => r.error).length ?? 0

    const beforeScore = beforeResult?.averageScore ?? 0
    const afterScore = afterResult?.averageScore ?? 0
    const beforeScoreExcl =
      beforeResult?.averageScoreExcludingFailures ?? 0
    const afterScoreExcl =
      afterResult?.averageScoreExcludingFailures ?? 0
    const beforeCost = beforeResult?.averageCost ?? 0
    const afterCost = afterResult?.averageCost ?? 0
    const beforeDuration = beforeResult?.averageDuration ?? 0
    const afterDuration = afterResult?.averageDuration ?? 0

    const scoreDelta = afterScore - beforeScore
    const scoreExcludingFailuresDelta = afterScoreExcl - beforeScoreExcl
    const costDelta = afterCost - beforeCost
    const durationDelta = afterDuration - beforeDuration
    const errorCountDelta = afterErrors - beforeErrors

    // Regression: score dropped, OR errors increased, OR (cost increased
    // significantly without a score gain). "Significantly" = >20% of before
    // cost, to avoid flagging tiny noise.
    const costIncreasePct =
      beforeCost > 0 ? (costDelta / beforeCost) * 100 : 0
    const regression =
      (!beforeResult && !!afterResult) // agent only in after = not a regression
        ? false
        : (!afterResult && !!beforeResult) // agent disappeared = regression
          ? true
          : scoreDelta < -0.01 ||
            errorCountDelta > 0 ||
            (costIncreasePct > 20 && scoreDelta <= 0)

    // Improvement: score increased without a cost explosion.
    const improvement =
      !!beforeResult &&
      !!afterResult &&
      scoreDelta > 0.01 &&
      !(costIncreasePct > 20 && scoreDelta < 0.5)

    const summary = formatAgentSummary({
      scoreDelta,
      costDelta,
      durationDelta,
      beforeRunCount,
      afterRunCount,
    })

    agentDeltas.push({
      agentId,
      scoreDelta,
      scoreExcludingFailuresDelta,
      costDelta,
      durationDelta,
      errorCountDelta,
      beforeRunCount,
      afterRunCount,
      regression,
      summary,
    })

    totalScoreDelta += scoreDelta
    totalCostDelta += costDelta
    totalDurationDelta += durationDelta
    totalErrorDelta += errorCountDelta
    totalBeforeRuns += beforeRunCount
    totalAfterRuns += afterRunCount
    if (regression) regressedAgentIds.push(agentId)
    if (improvement) improvedAgentIds.push(agentId)
  }

  return {
    agentDeltas,
    overall: {
      totalScoreDelta,
      totalCostDelta,
      totalDurationDelta,
      totalErrorDelta,
      totalBeforeRuns,
      totalAfterRuns,
      regressedAgentIds,
      improvedAgentIds,
    },
    hasRegressions: regressedAgentIds.length > 0,
  }
}

function formatAgentSummary(params: {
  scoreDelta: number
  costDelta: number
  durationDelta: number
  beforeRunCount: number
  afterRunCount: number
}): string {
  const { scoreDelta, costDelta, durationDelta, beforeRunCount, afterRunCount } =
    params
  const scoreStr = formatDelta(scoreDelta, 2)
  const costStr = formatDelta(costDelta, 0)
  const durationStr = formatDurationDelta(durationDelta)
  return `score ${scoreStr}, cost ${costStr}, ${durationStr}, ${beforeRunCount}→${afterRunCount} runs`
}

function formatDelta(value: number, digits: number): string {
  const rounded = value.toFixed(digits)
  const sign = value > 0 ? '+' : ''
  return `${sign}${rounded}`
}

function formatDurationDelta(durationDelta: number): string {
  const absMs = Math.abs(durationDelta)
  if (absMs >= 60_000) {
    const minutes = durationDelta / 60_000
    const sign = minutes > 0 ? '+' : ''
    return `${sign}${minutes.toFixed(1)}m`
  }
  if (absMs >= 1_000) {
    const seconds = durationDelta / 1_000
    const sign = seconds > 0 ? '+' : ''
    return `${sign}${seconds.toFixed(0)}s`
  }
  const sign = durationDelta > 0 ? '+' : ''
  return `${sign}${durationDelta.toFixed(0)}ms`
}

/**
 * Produce a human-readable report from a ComparisonResult. Useful for logging
 * the closed-loop outcome.
 */
export function formatComparisonReport(result: ComparisonResult): string {
  const lines: string[] = []
  lines.push('## BuffBench Before/After Comparison')
  lines.push('')
  lines.push('| Agent | Score Δ | Cost Δ | Duration Δ | Runs | Status |')
  lines.push('|-------|---------|--------|------------|------|--------|')
  for (const delta of result.agentDeltas) {
    const status = delta.regression ? '⚠️ regression' : '✓ ok'
    lines.push(
      `| ${delta.agentId} | ${delta.scoreDelta.toFixed(2)} | ${delta.costDelta.toFixed(0)}c | ${formatDurationDelta(delta.durationDelta)} | ${delta.beforeRunCount}→${delta.afterRunCount} | ${status} |`,
    )
  }
  lines.push('')
  const o = result.overall
  lines.push(
    `**Overall:** score ${o.totalScoreDelta >= 0 ? '+' : ''}${o.totalScoreDelta.toFixed(2)}, cost ${o.totalCostDelta >= 0 ? '+' : ''}${o.totalCostDelta.toFixed(0)}c, runs ${o.totalBeforeRuns}→${o.totalAfterRuns}`,
  )
  if (o.regressedAgentIds.length > 0) {
    lines.push(
      `**Regressions:** ${o.regressedAgentIds.join(', ')}`,
    )
  }
  if (o.improvedAgentIds.length > 0) {
    lines.push(`**Improvements:** ${o.improvedAgentIds.join(', ')}`)
  }
  return lines.join('\n')
}
