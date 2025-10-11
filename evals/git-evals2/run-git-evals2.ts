import fs from 'fs'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { CodebuffClient } from '../../sdk/src/client'

import { runAgentOnCommit } from './agent-runner'
import { judgeCommitResult } from './judge'
import { analyzeAgentTraces, type AgentTraceData } from './trace-analyzer'
import { AgentEvalResults, EvalData, ProgressEvent } from './types'

export async function runGitEvals2(options: {
  evalDataPath: string
  agents: string[]
  outputPath?: string
  limit?: number
  onProgress?: (event: ProgressEvent) => void
  client?: CodebuffClient
}): Promise<{
  agents: Record<string, AgentEvalResults>
  timestamp: string
  totalDuration: number
}> {
  const { evalDataPath, agents, outputPath, limit, onProgress } = options

  const evalData: EvalData = JSON.parse(fs.readFileSync(evalDataPath, 'utf-8'))
  const commitsToRun = limit
    ? evalData.evalCommits.slice(0, limit)
    : evalData.evalCommits

  const client =
    options.client ??
    new CodebuffClient({
      apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
    })

  const startTime = Date.now()
  const results: Record<string, AgentEvalResults> = {}

  // Create logs directory with current date and time
  const date = new Date().toISOString().replace(/:/g, '-').slice(0, 16) // YYYY-MM-DDTHH-MM
  const outputDir = outputPath
    ? path.dirname(outputPath)
    : 'evals/git-evals2/results'
  const logsDir = path.join(outputDir, 'logs', date)
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  for (const agentId of agents) {
    results[agentId] = {
      agentId,
      runs: [],
      averageScore: 0,
      averageCost: 0,
      averageDuration: 0,
    }
  }

  for (const commit of commitsToRun) {
    console.log(`\n=== Evaluating commit ${commit.sha.slice(0, 7)} ===`)
    console.log(`Spec: ${commit.spec.slice(0, 100)}...`)

    // Store trace data for this commit to analyze later
    const commitTraces: AgentTraceData[] = []

    const agentPromises = agents.map(async (agentId) => {
      onProgress?.({
        type: 'agent_start',
        agent: agentId,
        commit: commit.sha,
      })

      try {
        const agentResult = await runAgentOnCommit({
          client,
          agentId,
          commit,
          repoUrl: evalData.repoUrl,
          initCommand: evalData.initCommand,
        })

        const judgeResult = await judgeCommitResult({
          client,
          spec: commit.spec,
          groundTruthFileStates: commit.fileStates,
          agentDiff: agentResult.diff,
          error: agentResult.error,
        })

        const evalRun = {
          commitSha: commit.sha,
          spec: commit.spec,
          diff: agentResult.diff,
          judging: judgeResult,
          cost: agentResult.cost,
          durationMs: agentResult.durationMs,
          error: agentResult.error,
        }

        // Save trace to logs directory
        const safeSpec = commit.spec
          .split('\n')[0]
          .replace(/[^a-zA-Z0-9]/g, '_')
          .slice(0, 20)
        const safeAgentId = agentId.replace(/[^a-zA-Z0-9-]/g, '_')
        const safeCommitShort = commit.sha.slice(0, 7)
        const traceFilename = `${safeSpec}-${safeAgentId}-${safeCommitShort}.json`
        const tracePath = path.join(logsDir, traceFilename)

        const traceData = {
          agentId,
          commitSha: commit.sha,
          spec: commit.spec,
          trace: agentResult.trace,
          diff: agentResult.diff,
          judgeResult,
          cost: agentResult.cost,
          durationMs: agentResult.durationMs,
          error: agentResult.error,
          timestamp: new Date().toISOString(),
        }

        fs.writeFileSync(tracePath, JSON.stringify(traceData, null, 2))
        console.log(`Trace saved to ${tracePath}`)

        // Store for later analysis
        commitTraces.push(traceData)

        onProgress?.({
          type: 'agent_complete',
          agent: agentId,
          commit: commit.sha,
          score: judgeResult.overallScore,
        })

        return { agentId, evalRun }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        onProgress?.({
          type: 'agent_error',
          agent: agentId,
          commit: commit.sha,
          error: errorMessage,
        })

        return {
          agentId,
          evalRun: {
            commitSha: commit.sha,
            spec: commit.spec,
            diff: '',
            judging: {
              analysis: '',
              strengths: [],
              weaknesses: [],
              completionScore: 0,
              codeQualityScore: 0,
              overallScore: 0,
            },
            cost: 0,
            durationMs: 0,
            error: errorMessage,
          },
        }
      }
    })

    const agentResults = await Promise.all(agentPromises)

    for (const { agentId, evalRun } of agentResults) {
      results[agentId].runs.push(evalRun)
    }

    // After all agents complete for this commit, run trace analysis
    if (commitTraces.length > 1) {
      console.log(
        `\n=== Analyzing agent traces for commit ${commit.sha.slice(0, 7)} ===`,
      )
      try {
        const analysis = await analyzeAgentTraces({
          client,
          traces: commitTraces,
          spec: commit.spec,
        })

        // Save analysis to logs directory
        const safeSpec = commit.spec
          .split('\n')[0]
          .replace(/[^a-zA-Z0-9]/g, '_')
          .slice(0, 30)
        const safeCommitShort = commit.sha.slice(0, 7)
        const analysisFilename = `${safeSpec}-ANALYSIS-${safeCommitShort}.json`
        const analysisPath = path.join(logsDir, analysisFilename)

        const analysisData = {
          commitSha: commit.sha,
          spec: commit.spec,
          timestamp: new Date().toISOString(),
          analysis,
          results: commitTraces.map((t) => ({
            agentId: t.agentId,
            ...t.judgeResult,
            cost: t.cost,
            durationMs: t.durationMs,
            error: t.error,
          })),
        }

        fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2))
        console.log(`Analysis saved to ${analysisPath}`)
        console.log(`\nOverall Analysis: ${analysis.overallAnalysis}`)
      } catch (error) {
        console.error(
          `Failed to analyze traces for commit ${commit.sha}:`,
          error,
        )
      }
    }
  }

  for (const [agentId, agentData] of Object.entries(results)) {
    const successfulRuns = agentData.runs.filter((r) => !r.error)
    const totalRuns = agentData.runs.length

    agentData.averageScore =
      successfulRuns.length > 0
        ? successfulRuns.reduce((sum, r) => sum + r.judging.overallScore, 0) /
          successfulRuns.length
        : 0

    agentData.averageCost =
      totalRuns > 0
        ? agentData.runs.reduce((sum, r) => sum + r.cost, 0) / totalRuns
        : 0

    agentData.averageDuration =
      totalRuns > 0
        ? agentData.runs.reduce((sum, r) => sum + r.durationMs, 0) / totalRuns
        : 0
  }

  const result = {
    agents: results,
    timestamp: new Date().toISOString(),
    totalDuration: Date.now() - startTime,
  }

  if (outputPath) {
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
    console.log(`\nResults written to ${outputPath}`)
  }

  console.log(`\nTraces saved to ${logsDir}`)
  console.log('\n=== Summary ===')
  for (const [agentId, data] of Object.entries(results)) {
    console.log(`\n${agentId}:`)
    console.log(`  Score: ${data.averageScore.toFixed(2)}/10`)
    console.log(`  Cost: $${data.averageCost.toFixed(4)}`)
    console.log(`  Duration: ${(data.averageDuration / 1000).toFixed(1)}s`)
    console.log(
      `  Success: ${data.runs.filter((r) => !r.error).length}/${data.runs.length}`,
    )
  }

  return result
}
