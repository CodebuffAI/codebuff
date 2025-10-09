#!/usr/bin/env bun

import { execFileSync } from 'child_process'
import path from 'path'

import { generateCompactId } from '@codebuff/common/util/string'
import { Command, Flags } from '@oclif/core'

import { sendEvalResultsEmail } from './email-eval-results'
import { analyzeEvalResults } from './post-eval-analysis'
import {
  mockRunGitEvals,
  runGitEvals,
  setGlobalConcurrencyLimit,
  terminateAllEvalChildren,
} from './run-git-evals'

import type { EvalConfig, EvalResult } from './types'
import type { GitEvalResultRequest } from '@codebuff/common/db/schema'

const DEFAULT_OUTPUT_DIR = 'git-evals'
const MOCK_PATH = 'git-evals/eval-result-codebuff-mock.json'
const API_BASE = 'https://www.codebuff.com/'

class RunEvalSetCommand extends Command {
  static description = 'Run evaluation sets for Codebuff'

  static examples = [
    '$ bun run run-eval-set',
    '$ bun run run-eval-set --sets codebuff,manifold',
    '$ bun run run-eval-set --sets all',
    '$ bun run run-eval-set --sets plane --output-dir custom-output',
    '$ bun run run-eval-set --email --no-analysis',
    '$ bun run run-eval-set --mock --no-insert',
    '$ bun run run-eval-set --title "Weekly Performance Test"',
  ]

  static flags = {
    sets: Flags.string({
      char: 's',
      description:
        'Comma-separated list of eval sets to run (codebuff, manifold, plane, saleor) or "all" for all sets',
      default: 'codebuff',
    }),
    'output-dir': Flags.string({
      char: 'o',
      description: 'Output directory for evaluation results',
      default: DEFAULT_OUTPUT_DIR,
    }),
    email: Flags.boolean({
      description: 'Send email summary',
      default: false,
      allowNo: true,
    }),
    analysis: Flags.boolean({
      description: 'Post-evaluation analysis',
      default: true,
      allowNo: true,
    }),
    mock: Flags.boolean({
      description: 'Run with mock data for testing',
      default: false,
      allowNo: true,
    }),
    insert: Flags.boolean({
      description: 'Insert results into database',
      default: true,
      allowNo: true,
    }),
    title: Flags.string({
      char: 't',
      description: 'Custom title for email subject',
    }),
    concurrency: Flags.integer({
      char: 'c',
      description: 'Number of concurrent evals to run',
      min: 1,
    }),
    'coding-agent': Flags.string({
      description: 'Coding agent to use',
      default: 'codebuff',
    }),
    agent: Flags.string({
      description: 'Codebuff agent id to use',
      default: 'base',
    }),
    help: Flags.help({ char: 'h' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(RunEvalSetCommand)

    await runEvalSet(flags)
  }
}

/**
 * Creates a git worktree for the current commit to isolate code version
 */
function createEvalWorktree(): string {
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  }).trim()

  const worktreeId = generateCompactId()
  // Get project root by going up from the evals/git-evals directory
  const projectRoot = path.resolve(__dirname, '../..')
  const worktreePath = path.resolve(
    projectRoot,
    '..',
    `codebuff-eval-worktree-${worktreeId}`,
  )

  console.log(`Creating eval worktree at ${worktreePath}...`)
  console.log(`Commit: ${currentCommit}`)

  try {
    execFileSync('git', ['worktree', 'add', worktreePath, currentCommit], {
      stdio: 'inherit',
    })
    console.log('✅ Worktree created successfully')

    // Install dependencies in worktree to ensure node_modules are in sync
    console.log('Installing dependencies in worktree...')
    execFileSync('bun', ['install'], {
      cwd: worktreePath,
      stdio: 'inherit',
    })
    console.log('✅ Dependencies installed successfully')

    return worktreePath
  } catch (error) {
    console.error('Failed to create worktree:', error)
    throw error
  }
}

/**
 * Removes the eval worktree
 */
function cleanupEvalWorktree(worktreePath: string): void {
  console.log(`\nCleaning up eval worktree at ${worktreePath}...`)

  try {
    // Remove the worktree
    execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
      stdio: 'inherit',
    })
    console.log('✅ Worktree removed successfully')
  } catch (error) {
    console.error('Failed to remove worktree:', error)
    // Try to prune if remove failed
    try {
      execFileSync('git', ['worktree', 'prune'], { stdio: 'inherit' })
    } catch (pruneError) {
      console.error('Failed to prune worktrees:', pruneError)
    }
  }
}

async function runEvalSet(options: {
  sets: string
  'output-dir': string
  email: boolean
  analysis: boolean
  mock: boolean
  insert: boolean
  title?: string
  concurrency?: number
  'coding-agent': string
  agent: string
}): Promise<void> {
  const {
    sets,
    'output-dir': outputDir,
    email: sendEmail,
    analysis: postEvalAnalysis,
    mock: mockEval,
    insert: shouldInsert,
    title,
    'coding-agent': codingAgentstr,
    agent,
  } = options

  if (!['codebuff', 'claude'].includes(codingAgentstr)) {
    throw new Error(`Invalid coding agent: ${codingAgentstr}`)
  }
  const codingAgent = codingAgentstr as 'codebuff' | 'claude'

  console.log('Starting eval set run...')
  console.log(`Output directory: ${outputDir}`)

  // Create worktree to freeze code version for this eval run
  const worktreePath = createEvalWorktree()

  // Set up signal handlers to clean up child processes and worktree
  const signalHandler = async (signal: string) => {
    console.log(`\nReceived ${signal}, cleaning up evaluation processes...`)
    await terminateAllEvalChildren()
    cleanupEvalWorktree(worktreePath)
    console.log('Cleanup complete.')
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }

  process.on('SIGINT', () => signalHandler('SIGINT'))
  process.on('SIGTERM', () => signalHandler('SIGTERM'))

  setGlobalConcurrencyLimit(options.concurrency ?? 5)

  const validSets = ['codebuff', 'manifold', 'plane', 'saleor']
  const requestedSets =
    sets.trim().toLowerCase() === 'all'
      ? validSets
      : sets.split(',').map((s) => s.trim())

  const invalidSets = requestedSets.filter((s) => !validSets.includes(s))

  if (invalidSets.length > 0) {
    throw new Error(
      `Invalid eval sets: ${invalidSets.join(', ')}. Valid sets are: ${validSets.join(', ')} or "all"`,
    )
  }

  // Resolve paths relative to worktree if using one
  const baseDir = path.join(worktreePath, 'evals', 'git-evals')

  const allEvalConfigs: EvalConfig[] = [
    {
      name: 'codebuff',
      evalDataPath: path.join(baseDir, 'eval-codebuff2.json'),
      outputDir,
    },
    {
      name: 'manifold',
      evalDataPath: path.join(baseDir, 'eval-manifold2.json'),
      outputDir,
    },
    {
      name: 'plane',
      evalDataPath: path.join(baseDir, 'eval-plane.json'),
      outputDir,
    },
    {
      name: 'saleor',
      evalDataPath: path.join(baseDir, 'eval-saleor.json'),
      outputDir,
    },
  ]

  const evalConfigs = allEvalConfigs.filter((config) =>
    requestedSets.includes(config.name),
  )

  console.log(`Running ${evalConfigs.length} evaluations:`)
  evalConfigs.forEach((config) => {
    console.log(
      `  - ${config.name}: ${config.evalDataPath} -> ${config.outputDir} (${agent})`,
    )
  })

  const startTime = Date.now()
  const results: EvalResult[] = []

  // Run all evaluations in parallel
  const evalPromises = evalConfigs.map(async (config) => {
    console.log(`Starting ${config.name} evaluation...`)
    const evalStartTime = Date.now()

    let result
    try {
      result = mockEval
        ? mockRunGitEvals(MOCK_PATH)
        : await runGitEvals(
            config.evalDataPath,
            config.outputDir,
            codingAgent,
            config.limit,
            options.concurrency === 1,
            agent,
            worktreePath,
          )
    } catch (error) {
      const evalDuration = Date.now() - evalStartTime
      console.error(
        `❌ ${config.name} evaluation failed after ${(evalDuration / 1000).toFixed(1)}s:`,
        error,
      )
      return {
        name: config.name,
        status: 'error' as const,
        error: error instanceof Error ? error.message : String(error),
        duration: evalDuration,
      }
    }

    const evalDuration = Date.now() - evalStartTime
    console.log(
      `✅ ${config.name} evaluation completed in ${(evalDuration / 1000).toFixed(1)}s`,
    )

    let analysis
    // Run post-eval analysis
    if (postEvalAnalysis) {
      console.log(`Running post-eval analysis for ${config.name}...`)
      try {
        analysis = await analyzeEvalResults(result)
        console.log(`📊 Post-eval analysis completed for ${config.name}`)
        console.log(`\n=== ${config.name.toUpperCase()} ANALYSIS ===`)
        console.log(`Summary: ${analysis.summary}`)
        console.log(`\nTop Problems:`)
        analysis.problems.forEach((problem, i) => {
          console.log(
            `${i + 1}. [${problem.severity.toUpperCase()}] ${problem.title}`,
          )
          console.log(`   Frequency: ${(problem.frequency * 100).toFixed(1)}%`)
          console.log(`   ${problem.description}`)
        })
      } catch (analysisError) {
        console.warn(
          `⚠️ Post-eval analysis failed for ${config.name}:`,
          analysisError,
        )
      }
    }

    console.log('Completed analysis', !!analysis)

    return {
      name: config.name,
      status: 'success' as const,
      result,
      analysis,
      duration: evalDuration,
    }
  })

  console.log('Running evalPromises')
  const settledResults = await Promise.allSettled(evalPromises)
  console.log('Settled results', settledResults.length)
  settledResults.forEach((res, index) => {
    if (res.status === 'fulfilled') {
      results.push(res.value)
    } else {
      console.error(
        `❌ Eval config ${evalConfigs[index].name} was rejected:`,
        res.reason,
      )
      results.push({
        name: evalConfigs[index].name,
        status: 'error' as const,
        error:
          res.reason instanceof Error ? res.reason.message : String(res.reason),
        duration: 0,
      })
    }
  })

  const totalDuration = Date.now() - startTime

  // Report results
  console.log('\n' + '='.repeat(60))
  console.log('EVAL SET RESULTS')
  console.log('='.repeat(60))

  let successCount = 0
  let failureCount = 0

  results.forEach((result) => {
    if (result.status === 'success') {
      successCount++
      console.log(
        `✅ ${result.name}: SUCCESS (${(result.duration / 1000).toFixed(1)}s)`,
      )
      if (result.result?.overall_metrics) {
        const metrics = result.result.overall_metrics
        console.log(
          `   Overall Score: ${metrics.average_overall.toFixed(2)}/10`,
        )
        console.log(
          `   Completion: ${metrics.average_completion.toFixed(2)}/10`,
        )
        console.log(
          `   Code Quality: ${metrics.average_code_quality.toFixed(2)}/10`,
        )
        console.log(
          `   Runs: ${metrics.successful_runs}/${metrics.total_runs} successful`,
        )
      }
    } else {
      failureCount++
      console.log(
        `❌ ${result.name}: FAILED (${(result.duration / 1000).toFixed(1)}s)`,
      )
      console.log(`   Error: ${result.error}`)
    }
  })

  console.log('='.repeat(60))
  console.log(`Total time: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`Success: ${successCount}/${evalConfigs.length}`)
  console.log(`Failure: ${failureCount}/${evalConfigs.length}`)

  // Send email summary if we have successful results with analyses
  if (sendEmail) {
    const successfulResults = results.filter(
      (r) => r.status === 'success' && r.result && r.analysis,
    )
    if (successfulResults.length > 0) {
      console.log('\n📧 Sending eval results email...')
      try {
        const evalResults = successfulResults.map((r) => r.result!)
        const analyses = successfulResults
          .map((r) => r.analysis!)
          .filter(Boolean)

        const emailSent = await sendEvalResultsEmail(
          evalResults,
          analyses,
          undefined,
          title,
        )
        if (emailSent) {
          console.log('✅ Eval results email sent successfully!')
        } else {
          console.log(
            '⚠️ Email sending was skipped (likely missing configuration)',
          )
        }
      } catch (emailError) {
        console.error('❌ Failed to send eval results email:', emailError)
      }
    } else {
      console.log(
        '\n📧 Skipping email - no successful results with analyses to send',
      )
    }
  }

  // Insert the eval results into the database
  if (shouldInsert) {
    console.log('\n💾 Inserting eval results into database...')
    const successfulResults = results.filter(
      (r) => r.status === 'success' && r.result,
    )

    if (successfulResults.length > 0) {
      try {
        const insertPromises = successfulResults.map(async (resultWrapper) => {
          const evalResult = resultWrapper.result
          const config = evalConfigs.find((c) => c.name === resultWrapper.name)

          // average number of user turns
          const totalTurns = evalResult?.eval_runs?.reduce((acc, run) => {
            return acc + run.trace.length
          }, 0)
          const numCases = evalResult?.eval_runs?.length
          const avgTurns =
            totalTurns && numCases ? totalTurns / numCases : undefined

          // Map the eval result data to the database schema
          const payload: GitEvalResultRequest = {
            cost_mode: 'normal', // You can modify this based on your needs
            reasoner_model: undefined, // No longer using model config
            agent_model: agent,
            metadata: {
              numCases: evalResult?.overall_metrics?.total_runs,
              avgScore: evalResult?.overall_metrics?.average_overall,
              avgCompletion: evalResult?.overall_metrics?.average_completion,
              avgCodeQuality: evalResult?.overall_metrics?.average_code_quality,
              avgDuration: evalResult?.overall_metrics?.average_duration_ms,
              suite: resultWrapper.name,
              avgTurns,
            },
            cost: 0, // You'll need to calculate actual cost based on your eval results
          }

          const response = await fetch(`${API_BASE}api/git-evals`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }

          return response.json()
        })

        const insertResults = await Promise.allSettled(insertPromises)

        let successfulInserts = 0
        let failedInserts = 0

        insertResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successfulInserts++
            console.log(
              `✅ Inserted eval result for ${successfulResults[index].name}`,
            )
          } else {
            failedInserts++
            console.error(
              `❌ Failed to insert eval result for ${successfulResults[index].name}:`,
              result.reason,
            )
          }
        })

        console.log(
          `💾 Database insertion complete: ${successfulInserts} successful, ${failedInserts} failed`,
        )
      } catch (error) {
        console.error('❌ Error during database insertion:', error)
      }
    } else {
      console.log('💾 No successful eval results to insert into database')
    }
  }

  // Clean up worktree before exiting
  cleanupEvalWorktree(worktreePath)

  if (failureCount > 0) {
    console.log(
      '\n⚠️  Some evaluations failed. Check the logs above for details.',
    )
    process.exit(1)
  } else {
    console.log('\n🎉 All evaluations completed successfully!')
    process.exit(0)
  }
}

// CLI handling
if (require.main === module) {
  RunEvalSetCommand.run().catch((err) => {
    console.error('Error running eval set:', err)
    process.exit(1)
  })
}

export { runEvalSet, RunEvalSetCommand }
