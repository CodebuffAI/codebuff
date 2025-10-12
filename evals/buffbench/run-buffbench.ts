import fs from 'fs'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import pLimit from 'p-limit'

import { runAgentOnCommit } from './agent-runner'
import { judgeCommitResult } from './judge'
import { analyzeAgentTraces, type AgentTraceData } from './trace-analyzer'
import { CodebuffClient } from '../../sdk/src/client'

import type { AgentEvalResults, EvalDataV2, ProgressEvent } from './types'

export async function runBuffBench(options: {
  evalDataPath: string
  agents: string[]
  outputPath?: string
  commitConcurrency?: number
  onProgress?: (event: ProgressEvent) => void
  client?: CodebuffClient
}): Promise<{
  agents: Record<string, AgentEvalResults>
  timestamp: string
  totalDuration: number
}> {
  const {
    evalDataPath,
    agents,
    outputPath,
    commitConcurrency = 1,
    onProgress,
  } = options

  const evalData: EvalDataV2 = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8'),
  )
  const commitsToRun = evalData.evalCommits

  const client =
    options.client ??
    new CodebuffClient({
      apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
    })

  const startTime = Date.now()
  const results: Record<string, AgentEvalResults> = {}

  // Create logs directory with current date and time
  const date = new Date().toISOString().replace(/:/g, '-').slice(0, 16) // YYYY-MM-DDTHH-MM
  const outputDir = outputPath ? path.dirname(outputPath) : __dirname
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

  const commitLimit = pLimit(commitConcurrency)

  const commitPromises = commitsToRun.map((commit) =>
    commitLimit(async () => {
      console.log(
        `\n=== Evaluating task: ${commit.id} (${commit.sha.slice(0, 7)}) ===`,
      )
      console.log(`Prompt: ${commit.prompt}`)

      // Store trace data for this commit to analyze later
      const commitTraces: AgentTraceData[] = []

      const agentPromises = agents.map(async (agentId) => {
        onProgress?.({
          type: 'agent_start',
          agent: agentId,
          commit: commit.sha,
          evalId: commit.id,
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
            prompt: commit.prompt,
            groundTruthFileDiffs: commit.fileDiffs,
            contextFiles: agentResult.contextFiles,
            agentDiff: agentResult.diff,
            error: agentResult.error,
          })

          console.log(`\n[${agentId}] Judge Results:`)
          console.log(`  Overall Score: ${judgeResult.overallScore}/10`)
          console.log(`  Completion: ${judgeResult.completionScore}/10`)
          console.log(`  Code Quality: ${judgeResult.codeQualityScore}/10`)
          console.log(`  Analysis: ${judgeResult.analysis}`)
          if (judgeResult.strengths.length > 0) {
            console.log(`  Strengths: ${judgeResult.strengths.join(', ')}`)
          }
          if (judgeResult.weaknesses.length > 0) {
            console.log(`  Weaknesses: ${judgeResult.weaknesses.join(', ')}`)
          }

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
          const safeTaskId = commit.id.replace(/[^a-zA-Z0-9-]/g, '_')
          const safeAgentId = agentId.replace(/[^a-zA-Z0-9-]/g, '_')
          const safeCommitShort = commit.sha.slice(0, 7)
          const traceFilename = `${safeTaskId}-${safeAgentId}-${safeCommitShort}.json`
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
            evalId: commit.id,
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
            evalId: commit.id,
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

      // After all agents complete for this commit, run trace analysis
      if (commitTraces.length > 1) {
        console.log(
          `\n=== Analyzing agent traces for ${commit.id} (${commit.sha.slice(0, 7)}) ===`,
        )
        try {
          const analysis = await analyzeAgentTraces({
            client,
            traces: commitTraces,
            spec: commit.spec,
          })

          // Save analysis to logs directory
          const safeTaskId = commit.id.replace(/[^a-zA-Z0-9-]/g, '_')
          const analysisCommitShort = commit.sha.slice(0, 7)
          const analysisFilename = `${safeTaskId}-ANALYSIS-${analysisCommitShort}.json`
          const analysisPath = path.join(logsDir, analysisFilename)

          const analysisData = {
            commitSha: commit.sha,
            timestamp: new Date().toISOString(),
            ...analysis,
            results: commitTraces.map((t) => ({
              agentId: t.agentId,
              ...t.judgeResult,
              cost: t.cost,
              durationMs: t.durationMs,
              error: t.error,
            })),
            spec: commit.spec,
          }

          const { overallAnalysis, agentFeedback } = analysis
          fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2))
          console.log(`Analysis saved to ${analysisPath}`)
          console.log(`\n=== Trace Analysis ===`)
          console.log(overallAnalysis)
          if (agentFeedback.length > 0) {
            console.log(`\nAgent-Specific Feedback:`)
            agentFeedback.forEach((feedback: any) => {
              console.log(`\n  [${feedback.agentId}]`)
              if (feedback.strengths.length > 0) {
                console.log(
                  `    Strengths:\n${feedback.strengths.join('\n    - ')}}`,
                )
              }
              if (feedback.weaknesses.length > 0) {
                console.log(
                  `    Weaknesses:\n${feedback.weaknesses.join('\n    - ')}`,
                )
              }
              if (feedback.recommendations.length > 0) {
                console.log(
                  `    Recommendations:\n${feedback.recommendations.join('\n    - ')}`,
                )
              }
            })
          }
        } catch (error) {
          console.error(
            `Failed to analyze traces for commit ${commit.sha}:`,
            error,
          )
        }
      }

      return { commit, agentResults }
    }),
  )

  const commitResults = await Promise.allSettled(commitPromises)

  for (const result of commitResults) {
    if (result.status === 'fulfilled') {
      const { agentResults } = result.value
      for (const { agentId, evalRun } of agentResults) {
        results[agentId].runs.push(evalRun)
      }
    } else {
      console.error('Commit processing failed:', result.reason)
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

  const logFiles = fs.readdirSync(logsDir)

  const finalResults = {
    metadata: {
      timestamp: result.timestamp,
      evalDataPath,
      agentsTested: agents,
      commitsEvaluated: commitsToRun.length,
      totalCommitsInEval: evalData.evalCommits.length,
      repoUrl: evalData.repoUrl,
      initCommand: evalData.initCommand,
      totalDuration: result.totalDuration,
      logsDirectory: logsDir,
      files: logFiles,
    },
    ...result.agents,
  }

  const finalResultsPath = path.join(logsDir, 'FINAL_RESULTS.json')
  fs.writeFileSync(finalResultsPath, JSON.stringify(finalResults, null, 2))

  console.log(`Traces saved to ${logsDir}`)
  console.log('\n=== Summary ===')
  for (const [agentId, data] of Object.entries(results)) {
    console.log(`\n${agentId}:`)
    console.log(`  Average Score: ${data.averageScore.toFixed(2)}/10`)
    console.log(`  Average Cost: $${data.averageCost.toFixed(4)}`)
    console.log(
      `  Average Duration: ${(data.averageDuration / 1000).toFixed(1)}s`,
    )
    console.log(
      `  Success: ${data.runs.filter((r) => !r.error).length}/${data.runs.length}`,
    )
  }

  return result
}
