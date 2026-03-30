import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { CodebuffClient, loadLocalAgents } from '@codebuff/sdk'

import { buildCommitTask, getCommitList } from './commit-task-generator'
import {
  getCriteriaForLevel,
  loadCriteria,
  maybePromoteCriteria,
  saveCriteria,
} from './criteria'
import {
  analyzeFailure,
  applyDocEdit,
  compareScores,
  readCurrentDocs,
  revertDocEdit,
} from './docs-optimizer'
import { judgeTaskResult } from './judge'
import {
  appendLogEntry,
  generateMorningReport,
} from './morning-report'
import { CodebuffRunner } from './runners/codebuff'
import { withTestRepo } from './test-repo-utils'

import type { QualityCriteria } from './criteria'
import type { ReviewerAgentType } from './judge'
import type { EvalbuffLogEntry } from './morning-report'
import type { CommitTask } from './commit-task-generator'

// --- State ---

interface EvalbuffState {
  lastProcessedCommitSha: string | null
  totalCostUsd: number
  recentScores: number[]
  processedCommitCount: number
}

function loadState(statePath: string): EvalbuffState {
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  }
  return {
    lastProcessedCommitSha: null,
    totalCostUsd: 0,
    recentScores: [],
    processedCommitCount: 0,
  }
}

function saveState(statePath: string, state: EvalbuffState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

// --- Shared options ---

export interface EvalbuffOptions {
  repoPath: string
  agentCommand?: string // deprecated — kept for backward compat with CLI runner
  agentId: string // codebuff agent ID, e.g. 'base2-free-evals'
  parallelism: number
  maxCostUsd: number
  agentTimeoutMs: number
  criteriaPath?: string
  reviewerAgents?: ReviewerAgentType[]
  initCommand?: string
}

export interface LearnOptions extends EvalbuffOptions {
  mode: 'learn'
  commitCount: number
}

export interface PromptOptions extends EvalbuffOptions {
  mode: 'prompt'
  prompt: string
}

// --- Core: run N agents in parallel, return average score ---

interface ParallelRunResult {
  avgScore: number
  scores: number[]
  diffs: string[]
  agentTraces: string[] // stdout from each agent run (their reasoning/tool calls)
  judgings: Array<import('./judge').JudgingResult>
  costEstimate: number
}

async function runAgentsInParallel(opts: {
  client: CodebuffClient
  agentId: string
  agentDefinitions: any[]
  prompt: string
  repoPath: string
  repoUrl: string
  localRepoPath?: string
  parentSha: string
  initCommand?: string
  groundTruthDiff?: string
  parallelism: number
  agentTimeoutMs: number
  criteria: QualityCriteria
  reviewerAgents?: ReviewerAgentType[]
  docsSourcePath: string // path to the repo where docs/ lives
}): Promise<ParallelRunResult> {
  const {
    client,
    agentId,
    agentDefinitions,
    prompt,
    repoUrl,
    localRepoPath,
    parentSha,
    initCommand,
    groundTruthDiff,
    parallelism,
    agentTimeoutMs,
    criteria,
    reviewerAgents,
    docsSourcePath,
  } = opts

  const runOne = async (idx: number) => {
    return withTestRepo(
      { repoUrl, localRepoPath, parentSha, initCommand },
      async (repoDir) => {
        // Copy current docs into the test repo
        copyDocsIntoRepo(docsSourcePath, repoDir)

        console.log(`  [Run ${idx + 1}/${parallelism}] Running agent via SDK...`)
        const shortSha = parentSha.slice(0, 8)
        const runner = new CodebuffRunner({
          cwd: repoDir,
          client,
          agentId,
          localAgentDefinitions: agentDefinitions,
          printEvents: false,
          commitId: shortSha,
          parentSha,
        })

        let result: Awaited<ReturnType<typeof runner.run>>
        try {
          result = await runner.run(prompt)
        } catch (runError) {
          // Infrastructure errors (503s, timeouts) should not produce a 0 score.
          // Return a sentinel so the caller can detect and handle it.
          const errMsg = runError instanceof Error ? runError.message : String(runError)
          console.warn(`  [Run ${idx + 1}/${parallelism}] Agent failed: ${errMsg.slice(0, 200)}`)
          return {
            score: -1, // sentinel: infrastructure failure
            diff: '',
            agentTrace: `Agent error: ${errMsg}`,
            judging: {
              analysis: `Agent failed: ${errMsg.slice(0, 500)}`,
              strengths: [],
              weaknesses: ['Agent failed due to infrastructure error'],
              e2eTestsPerformed: [],
              completionScore: -1,
              codeQualityScore: -1,
              e2eScore: -1,
              overallScore: -1,
            },
            costEstimate: 0,
          }
        }

        // Serialize trace steps as JSON for the doc writer to analyze
        const agentTrace = result.steps
          .map((step) => JSON.stringify(step))
          .join('\n')

        console.log(`  [Run ${idx + 1}/${parallelism}] Judging...`)
        const judging = await judgeTaskResult({
          taskPrompt: prompt,
          agentDiff: result.diff,
          groundTruthDiff,
          repoDir,
          error: result.diff === '' ? 'Agent made no changes' : undefined,
          criteria,
          reviewerAgents,
        })

        return {
          score: judging.overallScore,
          diff: result.diff,
          agentTrace,
          judging,
          costEstimate: result.totalCostUsd,
        }
      },
    )
  }

  const allResults = await Promise.all(
    Array.from({ length: parallelism }, (_, i) => runOne(i)),
  )

  // Filter out infrastructure failures (score === -1)
  const results = allResults.filter((r) => r.score >= 0)
  const totalCost = allResults.reduce((a, r) => a + r.costEstimate, 0)

  if (results.length === 0) {
    console.warn(`  All ${parallelism} agent runs failed (infrastructure errors)`)
    return {
      avgScore: -1,
      scores: [],
      diffs: [],
      agentTraces: allResults.map((r) => r.agentTrace),
      judgings: [],
      costEstimate: totalCost,
    }
  }

  if (results.length < allResults.length) {
    console.warn(`  ${allResults.length - results.length}/${allResults.length} runs failed, using ${results.length} valid results`)
  }

  const scores = results.map((r) => r.score)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

  return {
    avgScore,
    scores,
    diffs: results.map((r) => r.diff),
    agentTraces: results.map((r) => r.agentTrace),
    judgings: results.map((r) => r.judging),
    costEstimate: totalCost,
  }
}

/**
 * Copy docs into a test repo and commit them so they don't appear in the agent's diff.
 *
 * Without this commit, `git diff HEAD` after the agent runs would include
 * the pre-copied docs as "new files", corrupting the diff attribution —
 * the judge would penalize or credit the agent for docs it didn't create.
 */
function copyDocsIntoRepo(
  sourceRepoPath: string,
  targetRepoPath: string,
): void {
  const sourceDocsDir = path.join(sourceRepoPath, 'docs')
  const sourceAgentsMd = path.join(sourceRepoPath, 'AGENTS.md')
  const targetDocsDir = path.join(targetRepoPath, 'docs')
  const targetAgentsMd = path.join(targetRepoPath, 'AGENTS.md')

  let copied = false
  if (fs.existsSync(sourceDocsDir)) {
    fs.cpSync(sourceDocsDir, targetDocsDir, { recursive: true })
    copied = true
  }
  if (fs.existsSync(sourceAgentsMd)) {
    fs.cpSync(sourceAgentsMd, targetAgentsMd)
    copied = true
  }

  // Commit the docs so they become part of HEAD — otherwise git diff HEAD
  // after the agent runs will include these docs as agent-created changes.
  if (copied) {
    try {
      execSync('git add docs/ AGENTS.md 2>/dev/null; git add -u docs/ AGENTS.md 2>/dev/null', {
        cwd: targetRepoPath,
        stdio: 'ignore',
      })
      execSync('git commit -m "evalbuff: pre-load docs" --allow-empty', {
        cwd: targetRepoPath,
        stdio: 'ignore',
      })
    } catch {
      // If nothing to commit, that's fine
    }
  }
}

// --- Iterative doc improvement loop ---

/**
 * Run the iterative doc improvement loop for a single task.
 * Always analyzes failures. Keeps proposing doc changes until one is rejected.
 * Returns the final average score and log info.
 */
async function improveDocs(opts: {
  taskId: string
  prompt: string
  commitMessage?: string
  repoPath: string
  repoUrl: string
  localRepoPath?: string
  parentSha: string
  initCommand?: string
  groundTruthDiff?: string
  client: CodebuffClient
  agentId: string
  agentDefinitions: any[]
  parallelism: number
  agentTimeoutMs: number
  criteria: QualityCriteria
  reviewerAgents?: ReviewerAgentType[]
}): Promise<{
  finalScore: number
  baselineScore: number
  docsKept: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }>
  docsRejected: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }>
  totalCost: number
}> {
  const {
    taskId,
    prompt,
    commitMessage,
    repoPath,
    repoUrl,
    localRepoPath,
    parentSha,
    initCommand,
    groundTruthDiff,
    client,
    agentId,
    agentDefinitions,
    parallelism,
    agentTimeoutMs,
    criteria,
    reviewerAgents,
  } = opts

  let totalCost = 0
  const docsKept: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }> = []
  const docsRejected: Array<{ path: string; reasoning: string; scoreBefore: number; scoreAfter: number }> = []

  // Step 1: Baseline run
  console.log(`\n  Running ${parallelism} agents in parallel (baseline)...`)
  const baseline = await runAgentsInParallel({
    client,
    agentId,
    agentDefinitions,
    prompt,
    repoPath,
    repoUrl,
    localRepoPath,
    parentSha,
    initCommand,
    groundTruthDiff,
    parallelism,
    agentTimeoutMs,
    criteria,
    reviewerAgents,
    docsSourcePath: repoPath,
  })
  totalCost += baseline.costEstimate

  let currentScore = baseline.avgScore
  console.log(`  Baseline score: ${currentScore.toFixed(1)}/10 (scores: ${baseline.scores.map((s) => s.toFixed(1)).join(', ')})`)

  // All agents failed — skip this task entirely
  if (currentScore < 0) {
    console.log(`  All agent runs failed, skipping task.`)
    return {
      finalScore: 0,
      baselineScore: 0,
      docsKept: [],
      docsRejected: [],
      totalCost,
    }
  }

  // Early stopping: if baseline is already excellent, skip improvement loop
  const EARLY_STOP_THRESHOLD = 9.0
  if (currentScore >= EARLY_STOP_THRESHOLD) {
    console.log(`  Baseline score ${currentScore.toFixed(1)} >= ${EARLY_STOP_THRESHOLD}, skipping improvement loop.`)
    return {
      finalScore: currentScore,
      baselineScore: baseline.avgScore,
      docsKept: [],
      docsRejected: [],
      totalCost: totalCost,
    }
  }

  // Step 2: Iterative doc improvement
  let improving = true
  const MAX_IMPROVEMENT_ITERATIONS = 5
  let iterationCount = 0
  while (improving) {
    iterationCount++
    if (iterationCount > MAX_IMPROVEMENT_ITERATIONS) {
      console.log(`  Hit max improvement iterations (${MAX_IMPROVEMENT_ITERATIONS}), stopping.`)
      break
    }
    // Pick the worst-scoring judging for analysis
    const worstIdx = baseline.judgings.reduce(
      (minIdx, j, idx, arr) =>
        j.overallScore < arr[minIdx].overallScore ? idx : minIdx,
      0,
    )
    const worstJudging = baseline.judgings[worstIdx]
    const worstDiff = baseline.diffs[worstIdx]
    const worstTrace = baseline.agentTraces[worstIdx]

    const currentDocs = readCurrentDocs(repoPath)

    console.log(`  Analyzing for doc improvements...`)
    const editHistory = [
      ...docsKept.map((d) => ({ ...d, outcome: 'accepted' as const })),
      ...docsRejected.map((d) => ({ ...d, outcome: 'rejected' as const })),
    ]
    const docSuggestion = await analyzeFailure({
      judgeResult: worstJudging,
      taskPrompt: prompt,
      agentDiff: worstDiff,
      agentTrace: worstTrace,
      groundTruthDiff,
      currentDocs,
      editHistory,
      commitMessage,
    })

    if (!docSuggestion) {
      console.log(`  No doc suggestion — stopping improvement loop.`)
      break
    }

    console.log(`  Doc suggestion: ${docSuggestion.suggestedDocPath}`)
    console.log(`    Reasoning: ${docSuggestion.reasoning}`)

    // Save previous content so we can restore on rejection
    const docFullPath = path.join(repoPath, 'docs', docSuggestion.suggestedDocPath)
    const previousContent = fs.existsSync(docFullPath)
      ? fs.readFileSync(docFullPath, 'utf-8')
      : null

    // Apply doc to the main repo
    applyDocEdit(repoPath, docSuggestion.suggestedDocPath, docSuggestion.suggestedContent)

    // Re-run with new docs
    console.log(`  Re-running ${parallelism} agents with new docs...`)
    const rerun = await runAgentsInParallel({
      client,
      agentId,
      agentDefinitions,
      prompt,
      repoPath,
      repoUrl,
      localRepoPath,
      parentSha,
      initCommand,
      groundTruthDiff,
      parallelism,
      agentTimeoutMs,
      criteria,
      reviewerAgents,
      docsSourcePath: repoPath,
    })
    totalCost += rerun.costEstimate

    // If re-run failed entirely, don't count it as a rejection
    if (rerun.avgScore < 0) {
      console.log(`  Re-run failed (infrastructure errors), reverting doc and retrying later.`)
      if (previousContent !== null) {
        applyDocEdit(repoPath, docSuggestion.suggestedDocPath, previousContent)
      } else {
        revertDocEdit(repoPath, docSuggestion.suggestedDocPath)
      }
      break
    }

    const comparison = compareScores(currentScore, rerun.avgScore)
    console.log(`  New score: ${rerun.avgScore.toFixed(1)}/10 (${comparison}) (scores: ${rerun.scores.map((s) => s.toFixed(1)).join(', ')})`)

    if (comparison === 'improved' || comparison === 'same') {
      // 'improved' = clear signal the doc helps
      // 'same' = within noise range — keep it (benefit of the doubt)
      const reason = comparison === 'improved' ? 'score improved' : 'within noise range, keeping'
      console.log(`  Keeping doc: ${docSuggestion.suggestedDocPath} (${reason})`)
      docsKept.push({
        path: docSuggestion.suggestedDocPath,
        reasoning: docSuggestion.reasoning,
        scoreBefore: currentScore,
        scoreAfter: rerun.avgScore,
      })

      // Commit the doc change
      try {
        execSync('git add docs/ AGENTS.md', { cwd: repoPath, stdio: 'ignore' })
        execSync(
          `git commit -m "evalbuff: add ${docSuggestion.suggestedDocPath} (${taskId})"`,
          { cwd: repoPath, stdio: 'ignore' },
        )
      } catch {
        console.warn('Failed to commit doc change')
      }

      currentScore = rerun.avgScore

      // Update baseline data for next iteration
      baseline.judgings.splice(0, baseline.judgings.length, ...rerun.judgings)
      baseline.diffs.splice(0, baseline.diffs.length, ...rerun.diffs)
      baseline.agentTraces.splice(0, baseline.agentTraces.length, ...rerun.agentTraces)

      // Continue loop — try to improve more
    } else {
      console.log(`  Rejecting doc: ${docSuggestion.suggestedDocPath} (score dropped significantly)`)
      docsRejected.push({
        path: docSuggestion.suggestedDocPath,
        reasoning: docSuggestion.reasoning,
        scoreBefore: currentScore,
        scoreAfter: rerun.avgScore,
      })

      // Revert the doc edit — restore previous content if it existed
      if (previousContent !== null) {
        // Restore the previously-accepted version
        applyDocEdit(repoPath, docSuggestion.suggestedDocPath, previousContent)
      } else {
        revertDocEdit(repoPath, docSuggestion.suggestedDocPath)
      }

      // Stop improving for this task
      improving = false
    }
  }

  return {
    finalScore: currentScore,
    baselineScore: baseline.avgScore,
    docsKept,
    docsRejected,
    totalCost,
  }
}

// --- Mode: Commit Learning ---

export async function runLearnMode(options: LearnOptions): Promise<void> {
  const {
    repoPath,
    agentId,
    parallelism,
    maxCostUsd,
    agentTimeoutMs,
    criteriaPath,
    reviewerAgents,
    commitCount,
    initCommand,
  } = options

  const statePath = path.join(repoPath, 'evalbuff-state.json')
  const logPath = path.join(repoPath, 'evalbuff-log.jsonl')
  const defaultCriteriaPath =
    criteriaPath || path.join(repoPath, 'evalbuff-criteria.json')

  const state = loadState(statePath)
  let criteria = loadCriteria(defaultCriteriaPath)

  // Initialize codebuff SDK client and load agent definitions
  const client = new CodebuffClient({ cwd: repoPath })
  const agentsDir = path.resolve(__dirname, '../../agents')
  const loadedAgents = await loadLocalAgents({ agentsPath: agentsDir })
  const agentDefinitions = Object.values(loadedAgents)
  console.log(`Loaded ${agentDefinitions.length} agent definitions from ${agentsDir}`)

  // Get the repo's remote URL
  let repoUrl: string
  try {
    repoUrl = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()
  } catch {
    throw new Error(
      `Could not determine remote URL for ${repoPath}. Make sure it has an 'origin' remote.`,
    )
  }

  // Get commits to process
  const commits = getCommitList(
    repoPath,
    commitCount,
    state.lastProcessedCommitSha || undefined,
  )

  console.log(`Evalbuff Learn Mode:`)
  console.log(`  Repo: ${repoPath}`)
  console.log(`  Remote: ${repoUrl}`)
  console.log(`  Agent: ${agentId}`)
  console.log(`  Parallelism: ${parallelism}`)
  console.log(`  Reviewer agents: ${(reviewerAgents || ['claude', 'codex']).join(', ')}`)
  console.log(`  Commits to process: ${commits.length}`)
  console.log(`  Max cost: $${maxCostUsd}`)
  console.log(`  Criteria level: ${criteria.level}/5`)
  console.log(
    `  Resumed from: ${state.lastProcessedCommitSha?.slice(0, 8) || '(fresh start)'}`,
  )
  console.log(`  Previously processed: ${state.processedCommitCount} commits`)

  for (const sha of commits) {
    // Budget check
    if (state.totalCostUsd >= maxCostUsd) {
      console.log(
        `\nReached max cost ($${state.totalCostUsd.toFixed(2)} >= $${maxCostUsd}). Stopping.`,
      )
      break
    }

    const shortSha = sha.slice(0, 8)
    console.log(
      `\n${'='.repeat(60)}\nCommit ${shortSha} (${state.processedCommitCount + 1})\n${'='.repeat(60)}`,
    )

    // Build task from commit
    const task = await buildCommitTask(repoPath, sha)
    if (!task) {
      console.log(`Skipping ${shortSha} (merge commit, initial commit, or too large)`)
      state.lastProcessedCommitSha = sha
      saveState(statePath, state)
      continue
    }

    console.log(`  Message: ${task.message.split('\n')[0].slice(0, 80)}`)
    console.log(`  Files: ${task.filesChanged.length}`)
    console.log(`  Prompt: ${task.prompt.slice(0, 100)}...`)

    const iterationStart = Date.now()

    let logEntry: EvalbuffLogEntry = {
      taskId: shortSha,
      timestamp: new Date().toISOString(),
      oldScore: 0,
      newScore: null,
      docEdit: null,
      scoreComparison: null,
      costUsd: 0,
      durationMs: 0,
      criteriaLevel: criteria.level,
    }

    try {
      const result = await improveDocs({
        taskId: shortSha,
        prompt: task.prompt,
        commitMessage: task.message,
        repoPath,
        repoUrl,
        localRepoPath: repoPath,
        parentSha: task.parentSha,
        initCommand,
        groundTruthDiff: task.diff,
        client,
        agentId,
        agentDefinitions,
        parallelism,
        agentTimeoutMs,
        criteria,
        reviewerAgents,
      })

      logEntry.oldScore = result.baselineScore
      logEntry.newScore =
        result.docsKept.length > 0 ? result.finalScore : null
      logEntry.costUsd = result.totalCost

      if (result.docsKept.length > 0) {
        logEntry.docEdit = {
          path: result.docsKept.map((d) => d.path).join(', '),
          reasoning: result.docsKept.map((d) => d.reasoning).join('; '),
        }
        logEntry.scoreComparison = 'improved'
      }

      // Update scores tracking
      state.recentScores.push(result.finalScore)

      // Check criteria promotion
      const newLevel = maybePromoteCriteria(criteria, state.recentScores)
      if (newLevel !== criteria.level) {
        criteria = {
          ...criteria,
          level: newLevel,
          criteria: getCriteriaForLevel(newLevel),
        }
        saveCriteria(defaultCriteriaPath, criteria)
        logEntry.criteriaLevel = newLevel
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error)
      console.error(`Error on commit ${shortSha}:`, errorMsg)
      logEntry.error = errorMsg
    }

    logEntry.durationMs = Date.now() - iterationStart
    state.totalCostUsd += logEntry.costUsd
    state.lastProcessedCommitSha = sha
    state.processedCommitCount++

    appendLogEntry(logPath, logEntry)
    saveState(statePath, state)
  }

  // Generate morning report
  console.log('\nGenerating report...')
  const report = generateMorningReport(logPath)
  const reportPath = path.join(
    repoPath,
    `evalbuff-report-${new Date().toISOString().slice(0, 10)}.md`,
  )
  fs.writeFileSync(reportPath, report)
  console.log(`Report written to: ${reportPath}`)
  console.log(report)
}

// --- Mode: Prompt ---

export async function runPromptMode(options: PromptOptions): Promise<void> {
  const {
    repoPath,
    agentId,
    parallelism,
    maxCostUsd,
    agentTimeoutMs,
    criteriaPath,
    reviewerAgents,
    prompt,
    initCommand,
  } = options

  const logPath = path.join(repoPath, 'evalbuff-log.jsonl')
  const defaultCriteriaPath =
    criteriaPath || path.join(repoPath, 'evalbuff-criteria.json')

  const criteria = loadCriteria(defaultCriteriaPath)

  // Initialize codebuff SDK client and load agent definitions
  const client = new CodebuffClient({ cwd: repoPath })
  const agentsDir = path.resolve(__dirname, '../../agents')
  const loadedAgents = await loadLocalAgents({ agentsPath: agentsDir })
  const agentDefinitions = Object.values(loadedAgents)

  let repoUrl: string
  try {
    repoUrl = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()
  } catch {
    throw new Error(
      `Could not determine remote URL for ${repoPath}. Make sure it has an 'origin' remote.`,
    )
  }

  // Get current HEAD as the parentSha (agents work on the current state)
  const headSha = execSync('git rev-parse HEAD', {
    cwd: repoPath,
    encoding: 'utf-8',
  }).trim()

  console.log(`Evalbuff Prompt Mode:`)
  console.log(`  Repo: ${repoPath}`)
  console.log(`  Remote: ${repoUrl}`)
  console.log(`  Agent: ${agentId}`)
  console.log(`  Parallelism: ${parallelism}`)
  console.log(`  Reviewer agents: ${(reviewerAgents || ['claude', 'codex']).join(', ')}`)
  console.log(`  Max cost: $${maxCostUsd}`)
  console.log(`  Criteria level: ${criteria.level}/5`)
  console.log(`  Prompt: ${prompt.slice(0, 100)}...`)

  const iterationStart = Date.now()

  const logEntry: EvalbuffLogEntry = {
    taskId: 'prompt-mode',
    timestamp: new Date().toISOString(),
    oldScore: 0,
    newScore: null,
    docEdit: null,
    scoreComparison: null,
    costUsd: 0,
    durationMs: 0,
    criteriaLevel: criteria.level,
  }

  try {
    const result = await improveDocs({
      taskId: 'prompt-mode',
      prompt,
      repoPath,
      repoUrl,
      localRepoPath: repoPath,
      parentSha: headSha,
      initCommand,
      // No ground truth diff in prompt mode
      client,
      agentId,
      agentDefinitions,
      parallelism,
      agentTimeoutMs,
      criteria,
      reviewerAgents,
    })

    logEntry.oldScore = result.baselineScore
    logEntry.newScore =
      result.docsKept.length > 0 ? result.finalScore : null
    logEntry.costUsd = result.totalCost

    if (result.docsKept.length > 0) {
      logEntry.docEdit = {
        path: result.docsKept.map((d) => d.path).join(', '),
        reasoning: result.docsKept.map((d) => d.reasoning).join('; '),
      }
      logEntry.scoreComparison = 'improved'
    }

    console.log(`\nResult:`)
    console.log(`  Baseline score: ${result.baselineScore.toFixed(1)}/10`)
    console.log(`  Final score: ${result.finalScore.toFixed(1)}/10`)
    console.log(`  Docs kept: ${result.docsKept.length}`)
    console.log(`  Docs rejected: ${result.docsRejected.length}`)
    console.log(`  Cost: $${result.totalCost.toFixed(2)}`)
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error)
    console.error(`Error in prompt mode:`, errorMsg)
    logEntry.error = errorMsg
  }

  logEntry.durationMs = Date.now() - iterationStart
  appendLogEntry(logPath, logEntry)
}

// --- CLI entry point ---

async function main() {
  const args = process.argv.slice(2)
  const getArg = (name: string, defaultValue?: string): string => {
    const idx = args.indexOf(`--${name}`)
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Missing required argument: --${name}`)
  }
  const hasArg = (name: string): boolean => args.includes(`--${name}`)

  const repoPath = getArg('repo')
  const agentId = getArg('agent', 'base2-free-evals')
  const parallelism = parseInt(getArg('parallelism', '5'))
  const maxCostUsd = parseFloat(getArg('max-cost', '100'))
  const agentTimeoutMs = parseInt(getArg('agent-timeout', '300000'))
  const criteriaPath = hasArg('criteria') ? getArg('criteria') : undefined
  const initCommand = hasArg('init-command') ? getArg('init-command') : undefined
  const reviewerAgentsArg = hasArg('reviewers')
    ? getArg('reviewers')
    : undefined
  const reviewerAgents = reviewerAgentsArg
    ? (reviewerAgentsArg.split(',') as ReviewerAgentType[])
    : undefined

  if (hasArg('prompt')) {
    // Prompt mode
    const prompt = getArg('prompt')
    await runPromptMode({
      mode: 'prompt',
      repoPath,
      agentId,
      parallelism,
      maxCostUsd,
      agentTimeoutMs,
      criteriaPath,
      reviewerAgents,
      prompt,
      initCommand,
    })
  } else {
    // Learn mode (default)
    const commitCount = parseInt(getArg('commits', '500'))
    await runLearnMode({
      mode: 'learn',
      repoPath,
      agentId,
      parallelism,
      maxCostUsd,
      agentTimeoutMs,
      criteriaPath,
      reviewerAgents,
      commitCount,
      initCommand,
    })
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Evalbuff failed:', error)
    process.exit(1)
  })
}
