import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { runCliAgent } from './cli-runner'
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
} from './docs-optimizer'
import { judgeCommitResult } from './judge'
import {
  appendLogEntry,
  generateMorningReport,
} from './morning-report'
import { withTestRepo } from './test-repo-utils'

import type { QualityCriteria } from './criteria'
import type { ReviewerAgentType } from './judge'
import type { EvalbuffLogEntry } from './morning-report'
import type { EvalCommitV2, EvalDataV2 } from './types'

export interface EvalbuffOptions {
  repoPath: string
  agentCommand: string
  evalDataPaths: string[]
  maxIterations: number
  maxCostUsd: number
  scoreThreshold: number
  agentTimeoutMs: number
  criteriaPath?: string
  reviewerAgents?: ReviewerAgentType[]
}

interface EvalbuffState {
  completedTaskIds: string[]
  totalCostUsd: number
  recentScores: number[]
}

function loadState(statePath: string): EvalbuffState {
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  }
  return { completedTaskIds: [], totalCostUsd: 0, recentScores: [] }
}

function saveState(statePath: string, state: EvalbuffState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

function loadEvalTasks(evalDataPaths: string[]): Array<{
  task: EvalCommitV2
  evalData: EvalDataV2
}> {
  const tasks: Array<{ task: EvalCommitV2; evalData: EvalDataV2 }> = []
  for (const evalPath of evalDataPaths) {
    const evalData: EvalDataV2 = JSON.parse(
      fs.readFileSync(evalPath, 'utf-8'),
    )
    for (const commit of evalData.evalCommits) {
      tasks.push({ task: commit, evalData })
    }
  }
  return tasks
}

function copyDocsIntoRepo(
  sourceRepoPath: string,
  targetRepoPath: string,
): void {
  const sourceDocsDir = path.join(sourceRepoPath, 'docs')
  const sourceAgentsMd = path.join(sourceRepoPath, 'AGENTS.md')
  const targetDocsDir = path.join(targetRepoPath, 'docs')
  const targetAgentsMd = path.join(targetRepoPath, 'AGENTS.md')

  if (fs.existsSync(sourceDocsDir)) {
    fs.cpSync(sourceDocsDir, targetDocsDir, { recursive: true })
  }
  if (fs.existsSync(sourceAgentsMd)) {
    fs.cpSync(sourceAgentsMd, targetAgentsMd)
  }
}

function getContextFiles(
  repoDir: string,
  commit: EvalCommitV2,
): Record<string, string> {
  const contextFiles: Record<string, string> = {}
  const contextFilePaths = new Set<string>([
    ...commit.supplementalFiles,
    ...commit.fileDiffs.map((fd) => fd.path),
  ])
  for (const { status, path: filePath } of commit.fileDiffs) {
    if (status === 'added') contextFilePaths.delete(filePath)
  }

  for (const filePath of contextFilePaths) {
    try {
      const content = execSync(
        `git show ${commit.parentSha}:${JSON.stringify(filePath)}`,
        { cwd: repoDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
      )
      contextFiles[filePath] = content
    } catch {
      contextFiles[filePath] = ''
    }
  }
  return contextFiles
}

export async function runEvalbuff(options: EvalbuffOptions): Promise<void> {
  const {
    repoPath,
    agentCommand,
    evalDataPaths,
    maxIterations,
    maxCostUsd,
    scoreThreshold,
    agentTimeoutMs,
    criteriaPath,
    reviewerAgents,
  } = options

  const statePath = path.join(repoPath, 'evalbuff-state.json')
  const logPath = path.join(repoPath, 'evalbuff-log.jsonl')

  // Strip API key env vars — eval data provides test keys for init commands
  // but agents need their real API keys to function
  const API_KEY_PATTERN = /(_KEY|_SECRET|_TOKEN|_API_KEY)$/i
  const stripApiKeys = (env?: Record<string, string>) => {
    if (!env) return undefined
    return Object.fromEntries(
      Object.entries(env).filter(([k]) => !API_KEY_PATTERN.test(k)),
    )
  }
  const safeEnv = (evalData: { env?: Record<string, string> }) =>
    stripApiKeys(evalData.env)
  const defaultCriteriaPath =
    criteriaPath || path.join(repoPath, 'evalbuff-criteria.json')

  const state = loadState(statePath)
  let criteria = loadCriteria(defaultCriteriaPath)
  const tasks = loadEvalTasks(evalDataPaths)


  console.log(`Evalbuff starting:`)
  console.log(`  Repo: ${repoPath}`)
  console.log(`  Agent: ${agentCommand}`)
  console.log(`  Reviewer agents: ${(reviewerAgents || ['claude', 'codex']).join(', ')}`)
  console.log(`  Tasks: ${tasks.length}`)
  console.log(`  Max iterations: ${maxIterations}`)
  console.log(`  Max cost: $${maxCostUsd}`)
  console.log(`  Score threshold: ${scoreThreshold}`)
  console.log(`  Criteria level: ${criteria.level}/5`)
  console.log(`  Completed: ${state.completedTaskIds.length} tasks`)

  let iterations = 0

  for (const { task, evalData } of tasks) {
    // Budget checks
    if (iterations >= maxIterations) {
      console.log(`Reached max iterations (${maxIterations}). Stopping.`)
      break
    }
    if (state.totalCostUsd >= maxCostUsd) {
      console.log(
        `Reached max cost ($${state.totalCostUsd.toFixed(2)} >= $${maxCostUsd}). Stopping.`,
      )
      break
    }

    // Skip completed tasks
    if (state.completedTaskIds.includes(task.id)) {
      console.log(`Skipping completed task: ${task.id}`)
      continue
    }

    iterations++
    const iterationStart = Date.now()
    console.log(
      `\n${'='.repeat(60)}\n[${iterations}/${maxIterations}] Task: ${task.id}\n${'='.repeat(60)}`,
    )

    let logEntry: EvalbuffLogEntry = {
      taskId: task.id,
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
      // Step 1: Run agent with current docs, then judge in the same repo
      console.log(`Running agent on task ${task.id}...`)
      const oldJudging = await withTestRepo(
        {
          repoUrl: evalData.repoUrl,
          parentSha: task.parentSha,
          initCommand: evalData.initCommand,
          env: evalData.env,
        },
        async (repoDir) => {
          // Copy current docs into the test repo
          copyDocsIntoRepo(repoPath, repoDir)

          const result = await runCliAgent({
            command: agentCommand,
            prompt: task.prompt,
            cwd: repoDir,
            timeoutMs: agentTimeoutMs,
            env: safeEnv(evalData),
          })

          const contextFiles = getContextFiles(repoDir, task)
          logEntry.costUsd += result.durationMs * 0.00001 // ~$0.01/sec rough estimate

          // Judge the result — reviewer agents run IN the repo
          // so they can build, test, start the app, use browser tools, etc.
          console.log(`Judging result with reviewer agents...`)
          const judging = await judgeCommitResult({
            commit: task,
            contextFiles,
            agentDiff: result.diff,
            repoDir,
            error: result.exitCode !== 0 ? result.stderr : undefined,
            criteria,
            reviewerAgents,
          })

          return judging
        },
      )

      logEntry.oldScore = oldJudging.overallScore
      console.log(`Score: ${oldJudging.overallScore.toFixed(1)}/10 (e2e: ${oldJudging.e2eScore.toFixed(1)})`)

      // Step 2: If score is low, try to improve docs
      if (oldJudging.overallScore < scoreThreshold) {
        console.log(`Score below threshold (${scoreThreshold}). Analyzing failure...`)

        const groundTruthDiff = task.fileDiffs
          .map(({ path: p, diff }) => `--- ${p}\n${diff}`)
          .join('\n\n')

        const currentDocs = readCurrentDocs(repoPath)

        const docSuggestion = await analyzeFailure({
          judgeResult: oldJudging,
          taskPrompt: task.prompt,
          agentDiff: '', // agent diff not preserved after withTestRepo cleanup
          groundTruthDiff,
          currentDocs,
          scoreThreshold,
        })

        if (docSuggestion) {
          console.log(
            `Doc suggestion: ${docSuggestion.suggestedDocPath} - ${docSuggestion.reasoning}`,
          )
          logEntry.docEdit = {
            path: docSuggestion.suggestedDocPath,
            reasoning: docSuggestion.reasoning,
          }

          // Re-run with updated docs on a FRESH repo, judge inside
          console.log(`Re-running agent with new doc...`)
          const newJudging = await withTestRepo(
            {
              repoUrl: evalData.repoUrl,
              parentSha: task.parentSha,
              initCommand: evalData.initCommand,
              env: evalData.env,
            },
            async (freshRepoDir) => {
              copyDocsIntoRepo(repoPath, freshRepoDir)
              applyDocEdit(
                freshRepoDir,
                docSuggestion.suggestedDocPath,
                docSuggestion.suggestedContent,
              )

              const result = await runCliAgent({
                command: agentCommand,
                prompt: task.prompt,
                cwd: freshRepoDir,
                timeoutMs: agentTimeoutMs,
                env: safeEnv(evalData),
              })

              const contextFiles = getContextFiles(freshRepoDir, task)
              logEntry.costUsd += result.durationMs * 0.00001 // ~$0.01/sec rough estimate

              console.log(`Re-judging with reviewer agents...`)
              return await judgeCommitResult({
                commit: task,
                contextFiles,
                agentDiff: result.diff,
                repoDir: freshRepoDir,
                error: result.exitCode !== 0 ? result.stderr : undefined,
                criteria,
                reviewerAgents,
              })
            },
          )

          logEntry.newScore = newJudging.overallScore
          logEntry.scoreComparison = compareScores(
            oldJudging.overallScore,
            newJudging.overallScore,
          )

          console.log(
            `New score: ${newJudging.overallScore.toFixed(1)}/10 (${logEntry.scoreComparison})`,
          )

          // Keep doc if it improved
          if (logEntry.scoreComparison === 'improved') {
            console.log(`Keeping doc edit: ${docSuggestion.suggestedDocPath}`)
            applyDocEdit(
              repoPath,
              docSuggestion.suggestedDocPath,
              docSuggestion.suggestedContent,
            )

            try {
              execSync('git add docs/ AGENTS.md', {
                cwd: repoPath,
                stdio: 'ignore',
              })
              execSync(
                `git commit -m "evalbuff: add docs for ${task.id}"`,
                {
                  cwd: repoPath,
                  stdio: 'ignore',
                },
              )
            } catch {
              console.warn('Failed to commit doc change (may have no changes)')
            }
          } else {
            console.log(`Reverting doc edit (${logEntry.scoreComparison})`)
          }
        }
      }

      // Update scores tracking
      state.recentScores.push(
        logEntry.newScore !== null ? logEntry.newScore : logEntry.oldScore,
      )

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
      console.error(`Error on task ${task.id}:`, errorMsg)
      logEntry.error = errorMsg
    }

    logEntry.durationMs = Date.now() - iterationStart
    state.totalCostUsd += logEntry.costUsd
    state.completedTaskIds.push(task.id)

    // Persist state and log
    appendLogEntry(logPath, logEntry)
    saveState(statePath, state)
  }

  // Generate morning report
  console.log('\nGenerating morning report...')
  const report = generateMorningReport(logPath)

  const reportPath = path.join(
    repoPath,
    `evalbuff-report-${new Date().toISOString().slice(0, 10)}.md`,
  )
  fs.writeFileSync(reportPath, report)
  console.log(`Morning report written to: ${reportPath}`)
  console.log(report)
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2)
  const getArg = (name: string, defaultValue?: string): string => {
    const idx = args.indexOf(`--${name}`)
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Missing required argument: --${name}`)
  }

  const repoPath = getArg('repo')
  const agentCommand = getArg('agent')
  const evalDataPaths = getArg('evals').split(',')
  const maxIterations = parseInt(getArg('max-iterations', '50'))
  const maxCostUsd = parseFloat(getArg('max-cost', '50'))
  const scoreThreshold = parseFloat(getArg('score-threshold', '7.0'))
  const agentTimeoutMs = parseInt(getArg('agent-timeout', '300000'))
  const criteriaPath = args.includes('--criteria')
    ? getArg('criteria')
    : undefined
  const reviewerAgentsArg = args.includes('--reviewers')
    ? getArg('reviewers')
    : undefined
  const reviewerAgents = reviewerAgentsArg
    ? (reviewerAgentsArg.split(',') as ReviewerAgentType[])
    : undefined

  await runEvalbuff({
    repoPath,
    agentCommand,
    evalDataPaths,
    maxIterations,
    maxCostUsd,
    scoreThreshold,
    agentTimeoutMs,
    criteriaPath,
    reviewerAgents,
  })
}

// Only run CLI when executed directly (not when imported)
if (import.meta.main) {
  main().catch((error) => {
    console.error('Evalbuff failed:', error)
    process.exit(1)
  })
}
