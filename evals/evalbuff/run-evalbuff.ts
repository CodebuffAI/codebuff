import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { CodebuffClient } from '@codebuff/sdk'

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
  } = options

  const statePath = path.join(repoPath, 'evalbuff-state.json')
  const logPath = path.join(repoPath, 'evalbuff-log.jsonl')
  const defaultCriteriaPath =
    criteriaPath || path.join(repoPath, 'evalbuff-criteria.json')

  const state = loadState(statePath)
  let criteria = loadCriteria(defaultCriteriaPath)
  const tasks = loadEvalTasks(evalDataPaths)

  const client = new CodebuffClient({})

  console.log(`Evalbuff starting:`)
  console.log(`  Repo: ${repoPath}`)
  console.log(`  Agent: ${agentCommand}`)
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
      // Step 1: Run agent with current docs
      console.log(`Running agent on task ${task.id}...`)
      const oldResult = await withTestRepo(
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
            env: evalData.env,
          })

          const contextFiles = getContextFiles(repoDir, task)

          return { ...result, contextFiles }
        },
      )

      // Judge the result
      console.log(`Judging result...`)
      const oldJudging = await judgeCommitResult({
        client,
        commit: task,
        contextFiles: oldResult.contextFiles,
        agentDiff: oldResult.diff,
        error: oldResult.exitCode !== 0 ? oldResult.stderr : undefined,
        criteria,
      })

      logEntry.oldScore = oldJudging.overallScore
      logEntry.costUsd += oldResult.durationMs * 0.001 // rough estimate

      console.log(`Score: ${oldJudging.overallScore.toFixed(1)}/10`)

      // Step 2: If score is low, try to improve docs
      if (oldJudging.overallScore < scoreThreshold) {
        console.log(`Score below threshold (${scoreThreshold}). Analyzing failure...`)

        const groundTruthDiff = task.fileDiffs
          .map(({ path: p, diff }) => `--- ${p}\n${diff}`)
          .join('\n\n')

        const currentDocs = readCurrentDocs(repoPath)

        const docSuggestion = await analyzeFailure({
          client,
          judgeResult: oldJudging,
          taskPrompt: task.prompt,
          agentDiff: oldResult.diff,
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

          // Re-run with updated docs on a FRESH repo
          console.log(`Re-running agent with new doc...`)
          const newResult = await withTestRepo(
            {
              repoUrl: evalData.repoUrl,
              parentSha: task.parentSha,
              initCommand: evalData.initCommand,
              env: evalData.env,
            },
            async (freshRepoDir) => {
              // Copy existing docs + new doc
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
                env: evalData.env,
              })

              const contextFiles = getContextFiles(freshRepoDir, task)
              return { ...result, contextFiles }
            },
          )

          // Judge the new result
          const newJudging = await judgeCommitResult({
            client,
            commit: task,
            contextFiles: newResult.contextFiles,
            agentDiff: newResult.diff,
            error: newResult.exitCode !== 0 ? newResult.stderr : undefined,
            criteria,
          })

          logEntry.newScore = newJudging.overallScore
          logEntry.costUsd += newResult.durationMs * 0.001
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

            // Commit the doc change
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

  await runEvalbuff({
    repoPath,
    agentCommand,
    evalDataPaths,
    maxIterations,
    maxCostUsd,
    scoreThreshold,
    agentTimeoutMs,
    criteriaPath,
  })
}

main().catch((error) => {
  console.error('Evalbuff failed:', error)
  process.exit(1)
})
