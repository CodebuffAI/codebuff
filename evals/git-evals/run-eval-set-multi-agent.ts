import fs from 'fs'
import path from 'path'

import { runGitEvals } from './run-git-evals'
import type { EvalConfig, FullEvalLog } from './types'

export interface AgentConfig {
  agentId: string
  displayName?: string
}

export interface MultiAgentEvalOptions {
  agents: AgentConfig[]
  evalConfigs: EvalConfig[]
  outputDir: string
  concurrency?: number
  codingAgent: 'codebuff' | 'claude'
  worktreePath?: string
  promptWithAgent: boolean
}

export interface AgentEvalResult {
  agentId: string
  displayName: string
  evalResults: Map<string, FullEvalLog>
  aggregateMetrics: {
    avgOverallScore: number
    avgCompletionScore: number
    avgCodeQualityScore: number
    avgCostUsd: number
    avgDurationMs: number
    successRate: number
  }
  errors: Array<{ evalSetName: string; error: any }>
}

export async function runMultiAgentEvals(
  options: MultiAgentEvalOptions,
): Promise<AgentEvalResult[]> {
  const {
    agents,
    evalConfigs,
    outputDir,
    codingAgent,
    worktreePath,
    promptWithAgent,
    concurrency,
  } = options

  const agentPromises = agents.map(async (agentConfig) => {
    const { agentId, displayName = agentId } = agentConfig

    console.log(`\n${'='.repeat(60)}`)
    console.log(`Starting evaluations for agent: ${displayName} (${agentId})`)
    console.log('='.repeat(60))

    const evalResults = new Map<string, FullEvalLog>()
    const errors: Array<{ evalSetName: string; error: any }> = []

    const evalSetPromises = evalConfigs.map(async (config) => {
      console.log(`  Running ${config.name} eval set for ${displayName}...`)

      try {
        const agentOutputDir = path.join(outputDir, agentId)
        if (!fs.existsSync(agentOutputDir)) {
          fs.mkdirSync(agentOutputDir, { recursive: true })
        }

        const result = await runGitEvals(
          config.evalDataPath,
          agentOutputDir,
          codingAgent,
          config.limit,
          false,
          agentId,
          worktreePath,
          promptWithAgent,
        )

        evalResults.set(config.name, result)
        console.log(`  ✅ ${config.name} completed for ${displayName}`)
        return { success: true, evalSetName: config.name }
      } catch (error) {
        console.error(`  ❌ ${config.name} failed for ${displayName}:`, error)
        errors.push({ evalSetName: config.name, error })
        return { success: false, evalSetName: config.name, error }
      }
    })

    await Promise.allSettled(evalSetPromises)

    const aggregateMetrics = calculateAggregateMetrics(
      Array.from(evalResults.values()),
    )

    return {
      agentId,
      displayName,
      evalResults,
      aggregateMetrics,
      errors,
    }
  })

  const results = await Promise.all(agentPromises)

  return results
}

function calculateAggregateMetrics(evalLogs: FullEvalLog[]) {
  if (evalLogs.length === 0) {
    return {
      avgOverallScore: 0,
      avgCompletionScore: 0,
      avgCodeQualityScore: 0,
      avgCostUsd: 0,
      avgDurationMs: 0,
      successRate: 0,
    }
  }

  const totalMetrics = evalLogs.reduce(
    (acc, log) => ({
      overallScore: acc.overallScore + log.overall_metrics.average_overall,
      completionScore:
        acc.completionScore + log.overall_metrics.average_completion,
      codeQualityScore:
        acc.codeQualityScore + log.overall_metrics.average_code_quality,
      costUsd: acc.costUsd + log.overall_metrics.average_cost_usd,
      durationMs: acc.durationMs + log.overall_metrics.average_duration_ms,
      successfulRuns: acc.successfulRuns + log.overall_metrics.successful_runs,
      totalRuns: acc.totalRuns + log.overall_metrics.total_runs,
    }),
    {
      overallScore: 0,
      completionScore: 0,
      codeQualityScore: 0,
      costUsd: 0,
      durationMs: 0,
      successfulRuns: 0,
      totalRuns: 0,
    },
  )

  const count = evalLogs.length

  return {
    avgOverallScore: totalMetrics.overallScore / count,
    avgCompletionScore: totalMetrics.completionScore / count,
    avgCodeQualityScore: totalMetrics.codeQualityScore / count,
    avgCostUsd: totalMetrics.costUsd / count,
    avgDurationMs: totalMetrics.durationMs / count,
    successRate: totalMetrics.successfulRuns / totalMetrics.totalRuns,
  }
}

export function printComparisonTable(
  results: AgentEvalResult[],
  evalSetNames: string[],
) {
  console.log('\n' + '='.repeat(100))
  console.log('MULTI-AGENT COMPARISON RESULTS')
  console.log('='.repeat(100))

  const colWidth = 20
  console.log('\nAggregate Metrics Across All Eval Sets:')
  console.log('-'.repeat(100))

  const header = [
    'Agent'.padEnd(colWidth),
    'Overall'.padEnd(12),
    'Completion'.padEnd(12),
    'Quality'.padEnd(12),
    'Success Rate'.padEnd(14),
    'Avg Cost ($)'.padEnd(12),
  ].join(' | ')

  console.log(header)
  console.log('-'.repeat(100))

  const sortedResults = [...results].sort(
    (a, b) =>
      b.aggregateMetrics.avgOverallScore - a.aggregateMetrics.avgOverallScore,
  )

  sortedResults.forEach((result) => {
    const row = [
      result.displayName.padEnd(colWidth),
      result.aggregateMetrics.avgOverallScore.toFixed(2).padEnd(12),
      result.aggregateMetrics.avgCompletionScore.toFixed(2).padEnd(12),
      result.aggregateMetrics.avgCodeQualityScore.toFixed(2).padEnd(12),
      `${(result.aggregateMetrics.successRate * 100).toFixed(1)}%`.padEnd(14),
      result.aggregateMetrics.avgCostUsd.toFixed(3).padEnd(12),
    ].join(' | ')

    console.log(row)
  })

  console.log('\n\nPer Eval Set Breakdown:')
  console.log('='.repeat(100))

  evalSetNames.forEach((evalSetName) => {
    console.log(`\n${evalSetName.toUpperCase()}:`)
    console.log('-'.repeat(100))

    const header = [
      'Agent'.padEnd(colWidth),
      'Overall'.padEnd(12),
      'Completion'.padEnd(12),
      'Quality'.padEnd(12),
      'Runs'.padEnd(10),
      'Cost ($)'.padEnd(10),
    ].join(' | ')

    console.log(header)
    console.log('-'.repeat(100))

    sortedResults.forEach((result) => {
      const evalLog = result.evalResults.get(evalSetName)

      if (!evalLog) {
        const errorInfo = result.errors.find(
          (e) => e.evalSetName === evalSetName,
        )
        const errorMsg = errorInfo
          ? ` (${errorInfo.error.message || 'Unknown error'})`
          : ''
        console.log(
          `${result.displayName.padEnd(colWidth)} | N/A - Failed to run${errorMsg}`,
        )
        return
      }

      const metrics = evalLog.overall_metrics
      const row = [
        result.displayName.padEnd(colWidth),
        metrics.average_overall.toFixed(2).padEnd(12),
        metrics.average_completion.toFixed(2).padEnd(12),
        metrics.average_code_quality.toFixed(2).padEnd(12),
        `${metrics.successful_runs}/${metrics.total_runs}`.padEnd(10),
        metrics.average_cost_usd.toFixed(3).padEnd(10),
      ].join(' | ')

      console.log(row)
    })
  })

  console.log('\n' + '='.repeat(100))
}

export function writeComparisonResults(
  results: AgentEvalResult[],
  outputDir: string,
  traceId: string,
) {
  const comparisonData = {
    timestamp: new Date().toISOString(),
    traceId,
    agents: results.map((result) => ({
      agentId: result.agentId,
      displayName: result.displayName,
      aggregateMetrics: result.aggregateMetrics,
      evalSets: Array.from(result.evalResults.entries()).map(([name, log]) => ({
        name,
        metrics: log.overall_metrics,
      })),
      errors: result.errors,
    })),
  }

  const comparisonPath = path.join(outputDir, `eval-comparison-${traceId}.json`)

  fs.writeFileSync(comparisonPath, JSON.stringify(comparisonData, null, 2))
  console.log(`\n📊 Comparison results written to: ${comparisonPath}`)
}
