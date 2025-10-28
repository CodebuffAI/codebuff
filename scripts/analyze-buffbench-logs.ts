#!/usr/bin/env bun
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

interface JudgingResult {
  analysis: string
  strengths: string[]
  weaknesses: string[]
  completionScore: number
  codeQualityScore: number
  overallScore: number
}

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

  for (const file of analysisFiles) {
    const filePath = join(logDirectory, file)
    const content = readFileSync(filePath, 'utf-8')
    const data: AnalysisFile = JSON.parse(content)

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

  // Filter bottom 25% if requested
  if (filterBottom25) {
    for (const agentId in agentScores) {
      const data = agentScores[agentId]
      // Sort scores to find the 25th percentile
      const sortedScores = [...data.scores].sort((a, b) => a - b)
      const cutoffIndex = Math.floor(sortedScores.length * 0.25)
      const cutoffScore = sortedScores[cutoffIndex]

      // Filter out tasks below the cutoff
      const filteredIndices = data.scores
        .map((score, idx) => (score >= cutoffScore ? idx : -1))
        .filter((idx) => idx !== -1)

      agentScores[agentId] = {
        scores: filteredIndices.map((idx) => data.scores[idx]),
        completionScores: filteredIndices.map(
          (idx) => data.completionScores[idx],
        ),
        qualityScores: filteredIndices.map((idx) => data.qualityScores[idx]),
        costs: filteredIndices.map((idx) => data.costs[idx]),
        durations: filteredIndices.map((idx) => data.durations[idx]),
      }
    }
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

  return results
}

// Main execution
const logDirectory = process.argv[2] || 'evals/buffbench/logs/2025-10-13T20-07'

console.log(`Analyzing logs from: ${logDirectory}\n`)

function printTable(
  results: ReturnType<typeof analyzeBuffbenchLogs>,
  title: string,
) {
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
}

const allResults = analyzeBuffbenchLogs(logDirectory, false)
printTable(allResults, 'Agent Performance Summary (All Tasks):')

console.log('\n')

const filteredResults = analyzeBuffbenchLogs(logDirectory, true)
printTable(
  filteredResults,
  'Agent Performance Summary (Top 75% Tasks by Overall Score):',
)
