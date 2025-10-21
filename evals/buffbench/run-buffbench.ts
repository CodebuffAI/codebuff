import fs from 'fs'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { loadLocalAgents } from '@codebuff/npm-app/agents/load-agents'
import pLimit from 'p-limit'

import { runAgentOnCommit } from './agent-runner'
import { formatTaskResults } from './format-output'
import { judgeCommitResult } from './judge'
import { analyzeAgentTraces, type AgentTraceData } from './trace-analyzer'
import { extractAgentLessons, saveAgentLessons } from './lessons-extractor'
import { CodebuffClient } from '../../sdk/src/client'

import type { AgentEvalResults, EvalDataV2 } from './types'
import { analyzeAllTasks } from './meta-analyzer'

async function runTask(options: {
  client: CodebuffClient
  commit: EvalDataV2['evalCommits'][0]
  agents: string[]
  repoUrl: string
  initCommand?: string
  logsDir: string
  index: number
  totalTasks: number
  analyzerContext: {
    agentDefinitions: any[]
    agentTypeDefinition: string
    testedAgentIds: string[]
  }
  localAgentDefinitions: any[]
  extractLessons: boolean
}) {
  const {
    client,
    commit,
    agents,
    repoUrl,
    initCommand,
    logsDir,
    index,
    totalTasks,
    analyzerContext,
    localAgentDefinitions,
    extractLessons,
  } = options

  console.log(
    `\n=== Task ${index + 1}/${totalTasks}: ${commit.id} (${commit.sha.slice(0, 7)}) ===`,
  )

  // Store trace data for this commit to analyze later
  const commitTraces: AgentTraceData[] = []

  const agentPromises = agents.map(async (agentId) => {
    const agentResult = await runAgentOnCommit({
      client,
      agentId,
      commit,
      repoUrl,
      initCommand,
      localAgentDefinitions,
    })

    const judgeResult = await judgeCommitResult({
      client,
      prompt: commit.prompt,
      groundTruthFileDiffs: commit.fileDiffs,
      contextFiles: agentResult.contextFiles,
      agentDiff: agentResult.diff,
      error: agentResult.error,
    })

    // Extract and append agent lessons
    if (extractLessons) {
      console.log(`[${commit.id}] Extracting lessons for ${agentId}...`)
      const { lessons } = await extractAgentLessons({
        client,
        localAgentDefinitions,
        prompt: commit.prompt,
        groundTruthFileDiffs: commit.fileDiffs,
        contextFiles: agentResult.contextFiles,
        agentDiff: agentResult.diff,
        agentTrace: agentResult.trace,
        judgeResult,
        error: agentResult.error,
      })

      saveAgentLessons({
        agentId,
        commitId: commit.id,
        commitSha: commit.sha,
        prompt: commit.prompt,
        lessons,
        lessonsDir: path.join(__dirname, 'agent-lessons'),
      })
    }

    const evalRun = {
      commitSha: commit.sha,
      prompt: commit.prompt,
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
    const traceFilename = `${index + 1}-${safeTaskId}-${safeAgentId}-${safeCommitShort}.json`
    const tracePath = path.join(logsDir, traceFilename)

    // Store judging result and trace for combined output later
    commitTraces.push({
      agentId,
      commitSha: commit.sha,
      prompt: commit.prompt,
      trace: agentResult.trace,
      diff: agentResult.diff,
      judgeResult,
      cost: agentResult.cost,
      durationMs: agentResult.durationMs,
      error: agentResult.error,
      timestamp: new Date().toISOString(),
    })

    fs.writeFileSync(
      tracePath,
      JSON.stringify(commitTraces[commitTraces.length - 1], null, 2),
    )

    return { agentId, evalRun }
  })

  const agentResults = await Promise.all(agentPromises)

  // After all agents complete for this commit, run trace analysis
  const traceAnalysis = await analyzeAgentTraces({
    client,
    traces: commitTraces,
    codingAgentPrompt: commit.prompt,
    analyzerContext,
  })

  const analysisData = {
    commitSha: commit.sha,
    timestamp: new Date().toISOString(),
    ...traceAnalysis,
    results: commitTraces.map((t) => ({
      agentId: t.agentId,
      ...t.judgeResult,
      cost: t.cost,
      durationMs: t.durationMs,
      error: t.error,
    })),
    prompt: commit.prompt,
  }

  // Save analysis to logs directory
  const safeTaskId = commit.id.replace(/[^a-zA-Z0-9-]/g, '_')
  const analysisCommitShort = commit.sha.slice(0, 7)
  const analysisFilename = `${index + 1}-${safeTaskId}-ANALYSIS-${analysisCommitShort}.json`
  const analysisPath = path.join(logsDir, analysisFilename)
  fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2))

  // Print all agent results with their judging, then trace analysis together
  console.log(
    formatTaskResults({
      commit,
      taskNumber: index + 1,
      totalTasks,
      agentResults: commitTraces.map((trace) => ({
        agentId: trace.agentId,
        judging: trace.judgeResult,
        cost: trace.cost,
        durationMs: trace.durationMs,
        error: trace.error,
        traceFilePath: path.join(
          logsDir,
          `${index + 1}-${commit.id.replace(/[^a-zA-Z0-9-]/g, '_')}-${trace.agentId.replace(/[^a-zA-Z0-9-]/g, '_')}-${commit.sha.slice(0, 7)}.json`,
        ),
      })),
      traceAnalysis,
    }),
  )

  return { commit, agentResults, commitTraces }
}

export async function runBuffBench(options: {
  evalDataPath: string
  agents: string[]
  taskConcurrency?: number
  client?: CodebuffClient
  taskIds?: string[]
  extractLessons?: boolean
}) {
  const { evalDataPath, agents, taskConcurrency = 1, taskIds, extractLessons = false } = options

  const evalData: EvalDataV2 = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8'),
  )

  let commitsToRun: EvalDataV2['evalCommits']
  if (taskIds && taskIds.length > 0) {
    const foundCommits: EvalDataV2['evalCommits'] = []
    const notFoundIds: string[] = []

    for (const taskId of taskIds) {
      const foundCommit = evalData.evalCommits.find((c) => c.id === taskId)
      if (foundCommit) {
        foundCommits.push(foundCommit)
      } else {
        notFoundIds.push(taskId)
      }
    }

    if (notFoundIds.length > 0) {
      const availableIds = evalData.evalCommits.map((c) => c.id).join(', ')
      throw new Error(
        `Task ID(s) not found: ${notFoundIds.join(', ')}. Available task IDs: ${availableIds}`,
      )
    }

    commitsToRun = foundCommits
    console.log(`Running ${foundCommits.length} task(s): ${taskIds.join(', ')}`)
  } else {
    commitsToRun = evalData.evalCommits
  }

  const client =
    options.client ??
    new CodebuffClient({
      apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
    })

  // Load local agent definitions and type definition file for analyzers
  const agentsPath = path.join(__dirname, '../../.agents')
  const loadedAgents = await loadLocalAgents({ agentsPath })
  const agentTypeDefinitionPath = path.join(
    agentsPath,
    'types',
    'agent-definition.ts',
  )
  const agentTypeDefinition = fs.existsSync(agentTypeDefinitionPath)
    ? fs.readFileSync(agentTypeDefinitionPath, 'utf-8')
    : ''

  const analyzerContext = {
    agentDefinitions: Object.values(loadedAgents),
    agentTypeDefinition,
    testedAgentIds: agents,
  }

  const startTime = Date.now()
  const results: Record<string, AgentEvalResults> = {}

  // Create logs directory with current date and time and agent IDs
  const date = new Date().toISOString().replace(/:/g, '-').slice(0, 16) // YYYY-MM-DDTHH-MM
  const agentNames = agents.map(id => id.replace(/[^a-zA-Z0-9-]/g, '_')).join('_vs_')
  const logsDir = path.join(__dirname, 'logs', `${date}_${agentNames}`)
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

  const commitLimit = pLimit(taskConcurrency)

  const commitPromises = commitsToRun.map((commit, index) =>
    commitLimit(() =>
      runTask({
        client,
        commit,
        agents,
        repoUrl: evalData.repoUrl,
        initCommand: evalData.initCommand,
        logsDir,
        index,
        totalTasks: commitsToRun.length,
        analyzerContext,
        localAgentDefinitions: analyzerContext.agentDefinitions,
        extractLessons,
      }),
    ),
  )

  const commitResults = await Promise.allSettled(commitPromises)

  // Track which commits had any agent errors
  const commitShasWithErrors = new Set<string>()

  for (const result of commitResults) {
    if (result.status === 'fulfilled') {
      const { commit, agentResults } = result.value

      // Check if any agent had an error for this commit
      const hasAnyError = agentResults.some(({ evalRun }) => evalRun.error)
      if (hasAnyError) {
        commitShasWithErrors.add(commit.sha)
      }

      for (const { agentId, evalRun } of agentResults) {
        results[agentId].runs.push(evalRun)
      }
    } else {
      console.error('Commit processing failed:', result.reason)
    }
  }

  for (const [_agentId, agentData] of Object.entries(results)) {
    // Filter out runs from commits where ANY agent had an error
    const validRuns = agentData.runs.filter(
      (r) => !commitShasWithErrors.has(r.commitSha),
    )

    agentData.averageScore =
      validRuns.length > 0
        ? validRuns.reduce((sum, r) => sum + r.judging.overallScore, 0) /
          validRuns.length
        : 0

    agentData.averageCost =
      validRuns.length > 0
        ? validRuns.reduce((sum, r) => sum + r.cost, 0) / validRuns.length
        : 0

    agentData.averageDuration =
      validRuns.length > 0
        ? validRuns.reduce((sum, r) => sum + r.durationMs, 0) / validRuns.length
        : 0
  }

  const logFiles = fs.readdirSync(logsDir)

  const metaAnalysis = await analyzeAllTasks({
    client,
    logsDir,
    agents,
    analyzerContext,
  })

  // Print meta-analysis results
  console.log('\n=== Meta-Analysis Results ===')
  console.log('\nOverall Comparison:')
  console.log(metaAnalysis.overallComparison)

  if (metaAnalysis.agentInsights.length > 0) {
    console.log('\nAgent-Specific Insights:')
    for (const insight of metaAnalysis.agentInsights) {
      console.log(`\n[${insight.agentId}]`)
      if (insight.consistentStrengths.length > 0) {
        console.log('  Strengths:', insight.consistentStrengths.join(', '))
      }
      if (insight.consistentWeaknesses.length > 0) {
        console.log('  Weaknesses:', insight.consistentWeaknesses.join(', '))
      }
    }
  }

  if (metaAnalysis.keyFindings.length > 0) {
    console.log('\nKey Findings:')
    metaAnalysis.keyFindings.forEach((finding, i) => {
      console.log(`  ${i + 1}. ${finding}`)
    })
  }

  const finalResults = {
    metadata: {
      timestamp: new Date().toISOString(),
      evalDataPath,
      agentsTested: agents,
      commitsEvaluated: commitsToRun.length,
      totalCommitsInEval: evalData.evalCommits.length,
      repoUrl: evalData.repoUrl,
      initCommand: evalData.initCommand,
      totalDuration: Date.now() - startTime,
      logsDirectory: logsDir,
      files: logFiles,
    },
    ...results,
  }

  const finalResultsPath = path.join(logsDir, 'FINAL_RESULTS.json')
  fs.writeFileSync(finalResultsPath, JSON.stringify(finalResults, null, 2))

  console.log(`Traces saved to ${logsDir}`)
  if (commitShasWithErrors.size > 0) {
    console.log(
      `\nNote: ${commitShasWithErrors.size} commit(s) had agent errors and were excluded from averages`,
    )
  }
  console.log('\n=== Summary ===')
  for (const [agentId, data] of Object.entries(results)) {
    const validRuns = data.runs.filter(
      (r) => !commitShasWithErrors.has(r.commitSha),
    )
    console.log(`\n${agentId}:`)
    console.log(`  Average Score: ${data.averageScore.toFixed(2)}/10`)
    console.log(`  Average Cost: ${data.averageCost.toFixed(4)}`)
    console.log(
      `  Average Duration: ${(data.averageDuration / 1000).toFixed(1)}s`,
    )
    console.log(
      `  Valid runs: ${validRuns.length}/${data.runs.length} (excluding ${commitShasWithErrors.size} commit(s) with errors)`,
    )
  }

  // Print all overall scores for distribution analysis
  console.log('\n=== Score Distribution ===')
  for (const [agentId, data] of Object.entries(results)) {
    const validRuns = data.runs.filter(
      (r) => !commitShasWithErrors.has(r.commitSha),
    )
    const scores = validRuns.map((r) => r.judging.overallScore.toFixed(1))
    console.log(`\n${agentId}:`)
    console.log(`  Scores: ${scores.join(', ')}`)
  }

  return finalResults
}
