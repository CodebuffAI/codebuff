#!/usr/bin/env bun
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
}

interface AnalysisFile {
  commitSha: string
  timestamp: string
  results: AgentResult[]
}

function analyzeBuffbenchLogs(logDirectory: string, filterBottom25 = false) {
  const files = readdirSync(logDirectory)
  const analysisFiles = files.filter((f) => f.includes('ANALYSIS'))

  // First pass: collect all data and identify tasks to exclude
  const taskData: Record<string, AnalysisFile> = {}
  const tasksToExclude = new Set<string>()

  for (const file of analysisFiles) {
    const filePath = join(logDirectory, file)
    const content = readFileSync(filePath, 'utf-8')
    const data: AnalysisFile = JSON.parse(content)
    const taskKey = data.commitSha

    taskData[taskKey] = data

    // Check if any agent in this task has zero or null overall score
    const hasZeroOrNullScore = data.results.some(
      (result) =>
        result.overallScore === 0 ||
        result.overallScore === null ||
        result.overallScore === undefined,
    )

    if (hasZeroOrNullScore) {
      tasksToExclude.add(taskKey)
    }
  }

  // Second pass: build agent scores excluding problematic tasks
  const agentScores: Record<
    string,
    {
      scores: number[]
      completionScores: number[]
      qualityScores: number[]
      costs: number[]
      durations: number[]
    }
  > = {}

  for (const [taskKey, data] of Object.entries(taskData)) {
    // Skip tasks where any agent had zero/null score
    if (tasksToExclude.has(taskKey)) {
      continue
    }

    for (const result of data.results) {
      if (!agentScores[result.agentId]) {
        agentScores[result.agentId] = {
          scores: [],
          completionScores: [],
          qualityScores: [],
          costs: [],
          durations: [],
        }
      }

      agentScores[result.agentId].scores.push(result.overallScore)
      agentScores[result.agentId].completionScores.push(result.completionScore)
      agentScores[result.agentId].qualityScores.push(result.codeQualityScore)
      agentScores[result.agentId].costs.push(result.cost)
      agentScores[result.agentId].durations.push(result.durationMs)
    }
  }

  if (tasksToExclude.size > 0) {
    console.log(
      `\nNote: Excluded ${tasksToExclude.size} task(s) where at least one agent had zero/null overall score\n`,
    )
  }

  // Filter bottom 25% if requested
  if (filterBottom25) {
    // Calculate a global cutoff based on all agents' scores combined
    const allScores: Array<{ score: number; taskKey: string }> = []

    // Collect all scores with their task identifiers
    for (const [taskKey, data] of Object.entries(taskData)) {
      if (tasksToExclude.has(taskKey)) continue

      for (const result of data.results) {
        allScores.push({ score: result.overallScore, taskKey })
      }
    }

    // Sort by score and find the 25th percentile cutoff
    allScores.sort((a, b) => a.score - b.score)
    const cutoffIndex = Math.floor(allScores.length * 0.25)
    const cutoffScore = allScores[cutoffIndex]?.score ?? 0

    // Identify tasks where ANY agent scored below the cutoff
    const tasksToExcludeForBottom25 = new Set<string>()
    for (const [taskKey, data] of Object.entries(taskData)) {
      if (tasksToExclude.has(taskKey)) continue

      const hasLowScore = data.results.some(
        (result) => result.overallScore < cutoffScore,
      )
      if (hasLowScore) {
        tasksToExcludeForBottom25.add(taskKey)
      }
    }

    // Rebuild agentScores excluding bottom 25% tasks
    const newAgentScores: typeof agentScores = {}

    for (const [taskKey, data] of Object.entries(taskData)) {
      if (tasksToExclude.has(taskKey)) continue
      if (tasksToExcludeForBottom25.has(taskKey)) continue

      for (const result of data.results) {
        if (!newAgentScores[result.agentId]) {
          newAgentScores[result.agentId] = {
            scores: [],
            completionScores: [],
            qualityScores: [],
            costs: [],
            durations: [],
          }
        }

        newAgentScores[result.agentId].scores.push(result.overallScore)
        newAgentScores[result.agentId].completionScores.push(
          result.completionScore,
        )
        newAgentScores[result.agentId].qualityScores.push(
          result.codeQualityScore,
        )
        newAgentScores[result.agentId].costs.push(result.cost)
        newAgentScores[result.agentId].durations.push(result.durationMs)
      }
    }

    // Replace agentScores with filtered version
    Object.keys(agentScores).forEach((key) => delete agentScores[key])
    Object.assign(agentScores, newAgentScores)
  }

  // Calculate averages and stats
  const results = Object.entries(agentScores).map(([agentId, data]) => {
    const avgOverall =
      data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    const avgCompletion =
      data.completionScores.reduce((a, b) => a + b, 0) /
      data.completionScores.length
    const avgQuality =
      data.qualityScores.reduce((a, b) => a + b, 0) / data.qualityScores.length

    const minOverall = Math.min(...data.scores)

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
      agentId,
      count: data.scores.length,
      averageOverallScore: avgOverall,
      averageCompletionScore: avgCompletion,
      averageQualityScore: avgQuality,
      minOverallScore: minOverall,
      stdDevOverall: stdDev,
      averageCost: avgCost,
      averageDurationMs: avgDuration,
    }
  })

  // Sort by average overall score descending
  results.sort((a, b) => b.averageOverallScore - a.averageOverallScore)

  return { results, agentScores }
}

// Main execution
const logDirectory = process.argv[2] || 'evals/buffbench/logs/2025-10-13T20-07'

console.log(`Analyzing logs from: ${logDirectory}\n`)

function printTable(
  data: ReturnType<typeof analyzeBuffbenchLogs>,
  title: string,
) {
  const { results, agentScores } = data
  console.log(title)
  console.log('='.repeat(130))
  console.log(
    'Agent ID'.padEnd(20),
    'Count'.padEnd(8),
    'Overall'.padEnd(10),
    'Min'.padEnd(8),
    'StdDev'.padEnd(10),
    'Completion'.padEnd(12),
    'Quality'.padEnd(10),
    'Cost ($)'.padEnd(10),
    'Duration (s)',
  )
  console.log('='.repeat(130))

  for (const result of results) {
    console.log(
      result.agentId.padEnd(20),
      result.count.toString().padEnd(8),
      result.averageOverallScore.toFixed(2).padEnd(10),
      result.minOverallScore.toFixed(2).padEnd(8),
      result.stdDevOverall.toFixed(2).padEnd(10),
      result.averageCompletionScore.toFixed(2).padEnd(12),
      result.averageQualityScore.toFixed(2).padEnd(10),
      result.averageCost.toFixed(2).padEnd(10),
      (result.averageDurationMs / 1000).toFixed(1),
    )
  }

  console.log('='.repeat(130))
  console.log(`Total agents analyzed: ${results.length}`)

  // Print raw scores grouped by agent
  console.log('\n=== Raw Overall Scores by Agent ===')
  for (const result of results) {
    const scores = agentScores[result.agentId].scores
      .map((s) => s.toFixed(1))
      .join(', ')
    console.log(`\n${result.agentId}:`)
    console.log(`  ${scores}`)
  }
}

const allResults = analyzeBuffbenchLogs(logDirectory, false)
printTable(allResults, 'Agent Performance Summary (All Tasks):')

console.log('\n')

const filteredResults = analyzeBuffbenchLogs(logDirectory, true)
printTable(
  filteredResults,
  'Agent Performance Summary (Top 75% Tasks by Overall Score):',
)
