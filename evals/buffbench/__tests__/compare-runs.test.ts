import { expect, describe, test } from 'bun:test'

import type { AgentEvalResults, EvalRun } from '../types'

import {
  compareRuns,
  formatComparisonReport,
  type ComparisonResult,
} from '../compare-runs'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeEvalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    commitSha: overrides.commitSha ?? 'abc123',
    prompt: overrides.prompt ?? 'do the thing',
    diff: overrides.diff ?? '',
    judging: overrides.judging ?? {
      analysis: '',
      strengths: [],
      weaknesses: [],
      completionScore: 5,
      codeQualityScore: 5,
      overallScore: 5,
    },
    cost: overrides.cost ?? 10,
    durationMs: overrides.durationMs ?? 5_000,
    error: overrides.error,
    finalCheckOutputs: overrides.finalCheckOutputs,
  }
}

function makeAgentResults(
  agentId: string,
  runs: EvalRun[],
  averages?: Partial<
    Pick<
      AgentEvalResults,
      | 'averageScore'
      | 'averageScoreExcludingFailures'
      | 'averageCost'
      | 'averageDuration'
    >
  >,
): AgentEvalResults {
  return {
    agentId,
    runs,
    averageScore: averages?.averageScore ?? 5,
    averageScoreExcludingFailures: averages?.averageScoreExcludingFailures ?? 5,
    averageCost: averages?.averageCost ?? 10,
    averageDuration: averages?.averageDuration ?? 5_000,
  }
}

// ---------------------------------------------------------------------------
// compareRuns — empty inputs
// ---------------------------------------------------------------------------

describe('compareRuns: empty inputs', () => {
  test('should return empty result when both before and after are empty', () => {
    const result = compareRuns([], [])
    expect(result.agentDeltas).toHaveLength(0)
    expect(result.hasRegressions).toBe(false)
    expect(result.overall.totalBeforeRuns).toBe(0)
    expect(result.overall.totalAfterRuns).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// compareRuns — no change
// ---------------------------------------------------------------------------

describe('compareRuns: no change', () => {
  test('should produce zero deltas when before equals after', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 6,
        averageCost: 20,
        averageDuration: 10_000,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 6,
        averageCost: 20,
        averageDuration: 10_000,
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas).toHaveLength(1)
    const delta = result.agentDeltas[0]
    expect(delta.scoreDelta).toBe(0)
    expect(delta.costDelta).toBe(0)
    expect(delta.durationDelta).toBe(0)
    expect(delta.regression).toBe(false)
    expect(result.hasRegressions).toBe(false)
  })

  test('should not flag improvement when score is unchanged', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageScore: 5 }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageScore: 5 }),
    ]
    const result = compareRuns(before, after)
    expect(result.overall.improvedAgentIds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// compareRuns — improvements
// ---------------------------------------------------------------------------

describe('compareRuns: improvements', () => {
  test('should flag improvement when score increases without cost explosion', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 7,
        averageCost: 22,
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].scoreDelta).toBe(2)
    expect(result.agentDeltas[0].regression).toBe(false)
    expect(result.overall.improvedAgentIds).toContain('agent-a')
  })

  test('should flag improvement when score gain >0.5 even with cost explosion', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 7,
        averageCost: 100, // >20% increase but score gained >0.5
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].regression).toBe(false)
    expect(result.overall.improvedAgentIds).toContain('agent-a')
  })

  test('should produce positive costDelta when after is cheaper', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageCost: 50 }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageCost: 30 }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].costDelta).toBe(-20)
  })
})

// ---------------------------------------------------------------------------
// compareRuns — regressions
// ---------------------------------------------------------------------------

describe('compareRuns: regressions', () => {
  test('should flag regression when score drops', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageScore: 7 }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageScore: 5 }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].scoreDelta).toBe(-2)
    expect(result.agentDeltas[0].regression).toBe(true)
    expect(result.hasRegressions).toBe(true)
    expect(result.overall.regressedAgentIds).toContain('agent-a')
  })

  test('should flag regression when error count increases', () => {
    const before = [
      makeAgentResults('agent-a', [
        makeEvalRun({ error: undefined }),
        makeEvalRun({ error: undefined }),
      ]),
    ]
    const after = [
      makeAgentResults('agent-a', [
        makeEvalRun({ error: undefined }),
        makeEvalRun({ error: 'timeout' }),
      ]),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].errorCountDelta).toBe(1)
    expect(result.agentDeltas[0].regression).toBe(true)
  })

  test('should flag regression when cost increases >20% without score gain', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5, // no gain
        averageCost: 50, // >20% increase
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].regression).toBe(true)
  })

  test('should not flag regression for small cost increase (<20%)', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 100,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 110, // 10% increase, under threshold
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].regression).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// compareRuns — agents present in only one run
// ---------------------------------------------------------------------------

describe('compareRuns: asymmetric agent presence', () => {
  test('should NOT flag regression when agent only appears in after (new agent)', () => {
    const after = [
      makeAgentResults('new-agent', [makeEvalRun()], { averageScore: 5 }),
    ]
    const result = compareRuns([], after)
    expect(result.agentDeltas[0].agentId).toBe('new-agent')
    expect(result.agentDeltas[0].regression).toBe(false)
    expect(result.hasRegressions).toBe(false)
  })

  test('should flag regression when agent only appears in before (disappeared)', () => {
    const before = [
      makeAgentResults('gone-agent', [makeEvalRun()], { averageScore: 5 }),
    ]
    const result = compareRuns(before, [])
    expect(result.agentDeltas[0].agentId).toBe('gone-agent')
    expect(result.agentDeltas[0].regression).toBe(true)
    expect(result.hasRegressions).toBe(true)
  })

  test('should include union of agents from both runs', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageScore: 5 }),
    ]
    const after = [
      makeAgentResults('agent-b', [makeEvalRun()], { averageScore: 5 }),
    ]
    const result = compareRuns(before, after)
    const ids = result.agentDeltas.map((d) => d.agentId).sort()
    expect(ids).toEqual(['agent-a', 'agent-b'])
  })
})

// ---------------------------------------------------------------------------
// compareRuns — aggregation across multiple agents
// ---------------------------------------------------------------------------

describe('compareRuns: multi-agent aggregation', () => {
  test('should aggregate totals across agents weighted by their deltas', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
        averageDuration: 10_000,
      }),
      makeAgentResults('agent-b', [makeEvalRun()], {
        averageScore: 4,
        averageCost: 15,
        averageDuration: 8_000,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 6,
        averageCost: 18,
        averageDuration: 9_000,
      }),
      makeAgentResults('agent-b', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 15,
        averageDuration: 8_000,
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.overall.totalScoreDelta).toBe(2) // +1 + +1
    expect(result.overall.totalCostDelta).toBe(-2) // -2 + 0
    expect(result.overall.totalDurationDelta).toBe(-1_000) // -1000 + 0
    expect(result.overall.totalBeforeRuns).toBe(2)
    expect(result.overall.totalAfterRuns).toBe(2)
    expect(result.overall.improvedAgentIds).toHaveLength(2)
    expect(result.overall.regressedAgentIds).toHaveLength(0)
  })

  test('should report mixed regression and improvement across agents', () => {
    const before = [
      makeAgentResults('improver', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
      }),
      makeAgentResults('regressor', [makeEvalRun()], { averageScore: 7 }),
    ]
    const after = [
      makeAgentResults('improver', [makeEvalRun()], {
        averageScore: 8,
        averageCost: 22,
      }),
      makeAgentResults('regressor', [makeEvalRun()], { averageScore: 4 }),
    ]
    const result = compareRuns(before, after)
    expect(result.overall.improvedAgentIds).toContain('improver')
    expect(result.overall.regressedAgentIds).toContain('regressor')
    expect(result.hasRegressions).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// compareRuns — run counts
// ---------------------------------------------------------------------------

describe('compareRuns: run counts', () => {
  test('should report before/after run counts per agent', () => {
    const before = [
      makeAgentResults('agent-a', [
        makeEvalRun(),
        makeEvalRun(),
        makeEvalRun(),
      ]),
    ]
    const after = [makeAgentResults('agent-a', [makeEvalRun(), makeEvalRun()])]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].beforeRunCount).toBe(3)
    expect(result.agentDeltas[0].afterRunCount).toBe(2)
  })

  test('should report 0 run counts for missing agents', () => {
    const before = [makeAgentResults('agent-a', [makeEvalRun(), makeEvalRun()])]
    const result = compareRuns(before, [])
    const delta = result.agentDeltas.find((d) => d.agentId === 'agent-a')!
    expect(delta.beforeRunCount).toBe(2)
    expect(delta.afterRunCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// formatComparisonReport
// ---------------------------------------------------------------------------

describe('formatComparisonReport', () => {
  test('should produce a markdown table with headers', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
      }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageScore: 7,
        averageCost: 18,
      }),
    ]
    const result = compareRuns(before, after)
    const report = formatComparisonReport(result)
    expect(report).toContain('## BuffBench Before/After Comparison')
    expect(report).toContain(
      '| Agent | Score Δ | Cost Δ | Duration Δ | Runs | Status |',
    )
    expect(report).toContain('agent-a')
    expect(report).toContain('Overall:')
  })

  test('should include ⚠️ regression marker for regressed agents', () => {
    const before = [
      makeAgentResults('bad-agent', [makeEvalRun()], { averageScore: 7 }),
    ]
    const after = [
      makeAgentResults('bad-agent', [makeEvalRun()], { averageScore: 4 }),
    ]
    const result = compareRuns(before, after)
    const report = formatComparisonReport(result)
    expect(report).toContain('⚠️ regression')
    expect(report).toContain('Regressions:')
  })

  test('should include ✓ ok marker for non-regressed agents', () => {
    const before = [
      makeAgentResults('good-agent', [makeEvalRun()], { averageScore: 5 }),
    ]
    const after = [
      makeAgentResults('good-agent', [makeEvalRun()], { averageScore: 8 }),
    ]
    const result = compareRuns(before, after)
    const report = formatComparisonReport(result)
    expect(report).toContain('✓ ok')
    expect(report).toContain('Improvements:')
  })

  test('should handle empty result (no agents)', () => {
    const result: ComparisonResult = compareRuns([], [])
    const report = formatComparisonReport(result)
    expect(report).toContain('## BuffBench Before/After Comparison')
    // Table headers present even with no rows
    expect(report).toContain(
      '|-------|---------|--------|------------|------|--------|',
    )
  })
})

// ---------------------------------------------------------------------------
// Summary formatting
// ---------------------------------------------------------------------------

describe('compareRuns: summary line formatting', () => {
  test('should include score, cost, and run count in summary', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun(), makeEvalRun()], {
        averageScore: 5,
        averageCost: 20,
      }),
    ]
    const after = [
      makeAgentResults(
        'agent-a',
        [makeEvalRun(), makeEvalRun(), makeEvalRun()],
        {
          averageScore: 7,
          averageCost: 15,
        },
      ),
    ]
    const result = compareRuns(before, after)
    const summary = result.agentDeltas[0].summary
    expect(summary).toContain('2→3 runs')
    expect(summary).toContain('score')
    expect(summary).toContain('cost')
  })

  test('should format duration delta in seconds for sub-minute values', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageDuration: 5_000 }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageDuration: 8_000 }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].summary).toMatch(/\d+s/)
  })

  test('should format duration delta in minutes for large values', () => {
    const before = [
      makeAgentResults('agent-a', [makeEvalRun()], { averageDuration: 60_000 }),
    ]
    const after = [
      makeAgentResults('agent-a', [makeEvalRun()], {
        averageDuration: 120_000,
      }),
    ]
    const result = compareRuns(before, after)
    expect(result.agentDeltas[0].summary).toMatch(/\d+\.\dm/)
  })
})
