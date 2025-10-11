import fs from 'fs'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { CodebuffClient } from '../../sdk/src/client'

import { runAgentOnCommit } from './agent-runner'
import { judgeCommitResult } from './judge'

import type {
  EvalData,
  GitEvals2Options,
  GitEvals2Result,
  AgentEvalResults,
} from './types'

export async function runGitEvals2(
  options: GitEvals2Options,
): Promise<GitEvals2Result> {
  const { evalDataPath, agents, outputPath, limit, onProgress } = options

  const evalData: EvalData = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8'),
  )
  const commitsToRun = limit
    ? evalData.evalCommits.slice(0, limit)
    : evalData.evalCommits

  const client =
    options.client ??
    new CodebuffClient({
      apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
    })

  const startTime = Date.now()
  const results = new Map<string, AgentEvalResults>()

  for (const agentId of agents) {
    results.set(agentId, {
      agentId,
      runs: [],
      averageScore: 0,
      averageCost: 0,
      averageDuration: 0,
    })
  }

  for (const commit of commitsToRun) {
    console.log(`\n=== Evaluating commit ${commit.sha.slice(0, 7)} ===`)
    console.log(`Spec: ${commit.spec.slice(0, 100)}...`)

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
          judgeScore: judgeResult.overallScore,
          judgeFeedback: judgeResult.analysis,
          cost: agentResult.cost,
          durationMs: agentResult.durationMs,
          error: agentResult.error,
        }

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
            judgeScore: 0,
            judgeFeedback: '',
            cost: 0,
            durationMs: 0,
            error: errorMessage,
          },
        }
      }
    })

    const agentResults = await Promise.all(agentPromises)

    for (const { agentId, evalRun } of agentResults) {
      const agentData = results.get(agentId)!
      agentData.runs.push(evalRun)
    }
  }

  for (const [agentId, agentData] of results) {
    const successfulRuns = agentData.runs.filter((r) => !r.error)
    const totalRuns = agentData.runs.length

    agentData.averageScore =
      successfulRuns.length > 0
        ? successfulRuns.reduce((sum, r) => sum + r.judgeScore, 0) /
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

  const result: GitEvals2Result = {
    agents: results,
    timestamp: new Date().toISOString(),
    totalDuration: Date.now() - startTime,
  }

  if (outputPath) {
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const serializedResult = {
      ...result,
      agents: Array.from(result.agents.entries()).map(([id, data]) => ({
        id,
        ...data,
      })),
    }
    fs.writeFileSync(outputPath, JSON.stringify(serializedResult, null, 2))
    console.log(`\nResults written to ${outputPath}`)
  }

  console.log('\n=== Summary ===')
  for (const [agentId, data] of results) {
    console.log(`\n${agentId}:`)
    console.log(`  Average Score: ${data.averageScore.toFixed(2)}/10`)
    console.log(`  Average Cost: $${data.averageCost.toFixed(4)}`)
    console.log(
      `  Average Duration: ${(data.averageDuration / 1000).toFixed(1)}s`,
    )
    console.log(
      `  Success Rate: ${data.runs.filter((r) => !r.error).length}/${data.runs.length}`,
    )
  }

  return result
}
