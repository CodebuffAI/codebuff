#!/usr/bin/env bun

/**
 * Compare buffbench runs on the tasks that they **BOTH** completed successfully.
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

interface AgentResult {
  agentId: string
  analysis: string
  strengths: string[]
  weaknesses: string[]
  completionScore: number
  codeQualityScore: number
  overallScore: number
  cost: number
  durationMs: number
  error?: string | null
}

interface AnalysisFile {
  commitSha: string
  timestamp: string
  results: AgentResult[]
}

function compareBuffbenchRuns(dir1: string, dir2: string) {
  // Read all ANALYSIS files from both directories
  const files1 = readdirSync(dir1).filter((f) => f.includes('ANALYSIS'))
  const files2 = readdirSync(dir2).filter((f) => f.includes('ANALYSIS'))

  // Parse analysis files and group by commit SHA
  const run1Data = new Map<string, AnalysisFile>()
  const run2Data = new Map<string, AnalysisFile>()

  for (const file of files1) {
    const content = readFileSync(join(dir1, file), 'utf-8')
    const data: AnalysisFile = JSON.parse(content)
    run1Data.set(data.commitSha, data)
  }

  for (const file of files2) {
    const content = readFileSync(join(dir2, file), 'utf-8')
    const data: AnalysisFile = JSON.parse(content)
    run2Data.set(data.commitSha, data)
  }

  // Find common commit SHAs where both runs have successful completions (no errors)
  // and no agent scored <= 1.0
  const commonCommitShas = Array.from(run1Data.keys()).filter((sha) => {
    if (!run2Data.has(sha)) return false

    // Check that all agents in both runs completed without errors
    const run1Results = run1Data.get(sha)!.results
    const run2Results = run2Data.get(sha)!.results

    const run1HasErrors = run1Results.some(
      (r) => r.error !== undefined && r.error !== null,
    )
    const run2HasErrors = run2Results.some(
      (r) => r.error !== undefined && r.error !== null,
    )

    // Check that no agent scored <= 1.0 or has null/undefined scores in either run
    const run1HasLowScores = run1Results.some(
      (r) => r.overallScore == null || r.overallScore <= 1.0,
    )
    const run2HasLowScores = run2Results.some(
      (r) => r.overallScore == null || r.overallScore <= 1.0,
    )

    return (
      !run1HasErrors && !run2HasErrors && !run1HasLowScores && !run2HasLowScores
    )
  })

  // Count tasks with various issues for reporting
  const run1Shas = Array.from(run1Data.keys())
  const run2Shas = Array.from(run2Data.keys())

  const run1TasksWithErrors = run1Shas.filter((sha) => {
    const results = run1Data.get(sha)!.results
    return results.some((r) => r.error !== undefined && r.error !== null)
  })

  const run2TasksWithErrors = run2Shas.filter((sha) => {
    const results = run2Data.get(sha)!.results
    return results.some((r) => r.error !== undefined && r.error !== null)
  })

  const run1TasksWithLowScores = run1Shas.filter((sha) => {
    const results = run1Data.get(sha)!.results
    return results.some((r) => r.overallScore == null || r.overallScore <= 1.0)
  })

  const run2TasksWithLowScores = run2Shas.filter((sha) => {
    const results = run2Data.get(sha)!.results
    return results.some((r) => r.overallScore == null || r.overallScore <= 1.0)
  })

  // Count tasks excluded (either errors OR low scores)
  const run1ExcludedTasks = new Set([
    ...run1TasksWithErrors,
    ...run1TasksWithLowScores,
  ])
  const run2ExcludedTasks = new Set([
    ...run2TasksWithErrors,
    ...run2TasksWithLowScores,
  ])

  console.log(`\nRun 1: ${dir1}`)
  console.log(`Run 2: ${dir2}`)
  console.log(`\nTotal tasks in Run 1: ${run1Data.size}`)
  console.log(`  - With errors: ${run1TasksWithErrors.length}`)
  console.log(`  - With scores ≤1.0: ${run1TasksWithLowScores.length}`)
  console.log(`  - Excluded (errors OR low scores): ${run1ExcludedTasks.size}`)
  console.log(`  - Valid: ${run1Data.size - run1ExcludedTasks.size}`)
  console.log(`\nTotal tasks in Run 2: ${run2Data.size}`)
  console.log(`  - With errors: ${run2TasksWithErrors.length}`)
  console.log(`  - With scores ≤1.0: ${run2TasksWithLowScores.length}`)
  console.log(`  - Excluded (errors OR low scores): ${run2ExcludedTasks.size}`)
  console.log(`  - Valid: ${run2Data.size - run2ExcludedTasks.size}`)
  console.log(
    `\nCommon tasks (both completed successfully with scores >1.0): ${commonCommitShas.length}\n`,
  )

  if (commonCommitShas.length === 0) {
    console.log(
      'No common successfully-completed tasks with scores >1.0 found between the two runs!',
    )
    return
  }

  // Collect scores for each agent across common tasks
  const agentScores: Record<
    string,
    {
      run: 1 | 2
      scores: number[]
      completionScores: number[]
      qualityScores: number[]
      costs: number[]
      durations: number[]
    }
  > = {}

  // Process Run 1
  for (const sha of commonCommitShas) {
    const data = run1Data.get(sha)!
    for (const result of data.results) {
      const key = `${result.agentId} (Run 1)`
      if (!agentScores[key]) {
        agentScores[key] = {
          run: 1,
          scores: [],
          completionScores: [],
          qualityScores: [],
          costs: [],
          durations: [],
        }
      }
      agentScores[key].scores.push(result.overallScore)
      agentScores[key].completionScores.push(result.completionScore)
      agentScores[key].qualityScores.push(result.codeQualityScore)
      agentScores[key].costs.push(result.cost)
      agentScores[key].durations.push(result.durationMs)
    }
  }

  // Process Run 2
  for (const sha of commonCommitShas) {
    const data = run2Data.get(sha)!
    for (const result of data.results) {
      const key = `${result.agentId} (Run 2)`
      if (!agentScores[key]) {
        agentScores[key] = {
          run: 2,
          scores: [],
          completionScores: [],
          qualityScores: [],
          costs: [],
          durations: [],
        }
      }
      agentScores[key].scores.push(result.overallScore)
      agentScores[key].completionScores.push(result.completionScore)
      agentScores[key].qualityScores.push(result.codeQualityScore)
      agentScores[key].costs.push(result.cost)
      agentScores[key].durations.push(result.durationMs)
    }
  }

  // Calculate averages and stats
  const results = Object.entries(agentScores).map(([agentKey, data]) => {
    const avgOverall =
      data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    const avgCompletion =
      data.completionScores.reduce((a, b) => a + b, 0) /
      data.completionScores.length
    const avgQuality =
      data.qualityScores.reduce((a, b) => a + b, 0) / data.qualityScores.length

    const minOverall = Math.min(...data.scores)
    const maxOverall = Math.max(...data.scores)

    // Calculate standard deviation
    const variance =
      data.scores.reduce(
        (sum, score) => sum + Math.pow(score - avgOverall, 2),
        0,
      ) / data.scores.length
    const stdDev = Math.sqrt(variance)

    const avgCost = data.costs.reduce((a, b) => a + b, 0) / data.costs.length
    const avgDuration =
      data.durations.reduce((a, b) => a + b, 0) / data.durations.length

    return {
      agentKey,
      run: data.run,
      count: data.scores.length,
      averageOverallScore: avgOverall,
      averageCompletionScore: avgCompletion,
      averageQualityScore: avgQuality,
      minOverallScore: minOverall,
      maxOverallScore: maxOverall,
      stdDevOverall: stdDev,
      averageCost: avgCost,
      averageDurationMs: avgDuration,
    }
  })

  // Sort by run, then by average overall score descending
  results.sort((a, b) => {
    if (a.run !== b.run) return a.run - b.run
    return b.averageOverallScore - a.averageOverallScore
  })

  // Print comparison table
  console.log('Comparison on Common Tasks (N=' + commonCommitShas.length + ')')
  console.log('='.repeat(140))
  console.log(
    'Agent'.padEnd(45),
    'Count'.padEnd(8),
    'Overall'.padEnd(10),
    'Min'.padEnd(8),
    'Max'.padEnd(8),
    'StdDev'.padEnd(10),
    'Completion'.padEnd(12),
    'Quality'.padEnd(10),
    'Cost ($)'.padEnd(10),
    'Duration (s)',
  )
  console.log('='.repeat(140))

  for (const result of results) {
    console.log(
      result.agentKey.padEnd(45),
      result.count.toString().padEnd(8),
      result.averageOverallScore.toFixed(2).padEnd(10),
      result.minOverallScore.toFixed(2).padEnd(8),
      result.maxOverallScore.toFixed(2).padEnd(8),
      result.stdDevOverall.toFixed(2).padEnd(10),
      result.averageCompletionScore.toFixed(2).padEnd(12),
      result.averageQualityScore.toFixed(2).padEnd(10),
      result.averageCost.toFixed(2).padEnd(10),
      (result.averageDurationMs / 1000).toFixed(1),
    )
  }

  console.log('='.repeat(140))

  // Calculate and display head-to-head comparisons
  console.log('\n=== Head-to-Head Comparison ===\n')

  // Group by agent name (without run suffix)
  const agentGroups = new Map<string, typeof results>()
  for (const result of results) {
    const agentName = result.agentKey.replace(/ \(Run [12]\)$/, '')
    if (!agentGroups.has(agentName)) {
      agentGroups.set(agentName, [])
    }
    agentGroups.get(agentName)!.push(result)
  }

  for (const [agentName, agentResults] of agentGroups.entries()) {
    if (agentResults.length === 2) {
      const run1 = agentResults.find((r) => r.run === 1)
      const run2 = agentResults.find((r) => r.run === 2)

      if (run1 && run2) {
        console.log(`${agentName}:`)
        const scoreDiff = run2.averageOverallScore - run1.averageOverallScore
        const costDiff = run2.averageCost - run1.averageCost
        const durationDiff =
          (run2.averageDurationMs - run1.averageDurationMs) / 1000

        console.log(
          `  Overall Score: ${run1.averageOverallScore.toFixed(2)} → ${run2.averageOverallScore.toFixed(2)} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff.toFixed(2)})`,
        )
        console.log(
          `  Cost: $${run1.averageCost.toFixed(2)} → $${run2.averageCost.toFixed(2)} (${costDiff >= 0 ? '+' : ''}${costDiff.toFixed(2)})`,
        )
        console.log(
          `  Duration: ${(run1.averageDurationMs / 1000).toFixed(1)}s → ${(run2.averageDurationMs / 1000).toFixed(1)}s (${durationDiff >= 0 ? '+' : ''}${durationDiff.toFixed(1)}s)`,
        )
        console.log()
      }
    }
  }
}

// Main execution
const logDir1 = process.argv[2] || 'evals/buffbench/logs/2025-10-20T06-29'
const logDir2 = process.argv[3] || 'evals/buffbench/logs/2025-10-20T21-26'

if (!process.argv[2] || !process.argv[3]) {
  console.log(
    'Usage: bun run scripts/compare-buffbench-runs.ts <log-dir-1> <log-dir-2>',
  )
  console.log('\nUsing default directories:')
  console.log(`  Dir 1: ${logDir1}`)
  console.log(`  Dir 2: ${logDir2}\n`)
}

compareBuffbenchRuns(logDir1, logDir2)
