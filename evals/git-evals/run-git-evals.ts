import { execFileSync, fork } from 'child_process'
import fs from 'fs'
import path from 'path'

import { disableLiveUserInputCheck } from '@codebuff/agent-runtime/live-user-inputs'
import { promptAiSdkStructured } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { getErrorObject } from '@codebuff/common/util/error'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'
import pLimit from 'p-limit'

import { resetRepoToCommit } from '../scaffolding'
import { createInitialSessionState } from '../test-setup'
import { judgeEvalRun } from './judge-git-eval'
import { createGithubUrl } from './pick-commits'
import { ClaudeRunner } from './runners/claude'
import { CodebuffRunner } from './runners/codebuff'
import { extractRepoNameFromUrl, setupTestRepo } from './setup-test-repo'
import { AgentDecisionSchema } from './types'

import type { AgentStep } from '../scaffolding'
import type { Runner } from './runners/runner'
import type {
  AgentDecision,
  CodebuffTrace,
  EvalCommit,
  EvalRunJudged,
  EvalRunLog,
  FullEvalLog,
  EvalData,
} from './types'
import type { ChildProcess } from 'child_process'
import type { z } from 'zod/v4'

disableLiveUserInputCheck()

export async function runSingleEval(
  evalCommit: EvalCommit,
  projectPath: string,
  clientSessionId: string,
  fingerprintId: string,
  codingAgent: 'codebuff' | 'claude',
  agent?: string,
  promptWithAgent: boolean = false,
): Promise<EvalRunJudged> {
  const startTime = new Date()
  const trace: CodebuffTrace[] = []
  let error: string | undefined
  let totalCostUsd = 0

  // Add process-level error handlers for this eval
  const originalUncaughtHandler = process.listeners('uncaughtException')
  const originalUnhandledHandler = process.listeners('unhandledRejection')

  let processError: string | undefined

  const uncaughtHandler = (err: Error) => {
    console.error('Uncaught exception during eval:', err)
    processError = `Uncaught exception: ${err.message}\n${err.stack}`
  }

  const unhandledHandler = (reason: any, promise: Promise<any>) => {
    console.error('Unhandled rejection during eval:', reason)
    processError = `Unhandled rejection: ${reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason)}`
  }

  process.on('uncaughtException', uncaughtHandler)
  process.on('unhandledRejection', unhandledHandler)

  try {
    // Reset to the parent commit
    resetRepoToCommit(projectPath, evalCommit.parentSha)

    // Initialize state
    let runner: Runner
    if (codingAgent === 'codebuff') {
      runner = new CodebuffRunner(
        {
          sessionState: await createInitialSessionState(projectPath),
          output: {
            type: 'error',
            message: 'No output yet',
          },
        },
        agent,
      )
    } else if (codingAgent === 'claude') {
      runner = new ClaudeRunner(projectPath)
    } else {
      codingAgent satisfies never
      throw new Error('Unknown coding agent')
    }

    let currentDecision: AgentDecision = 'continue'
    let attempts = 0
    const MAX_ATTEMPTS = promptWithAgent ? 5 : 1

    while (currentDecision === 'continue' && attempts < MAX_ATTEMPTS) {
      // Check for process-level errors
      if (processError) {
        throw new Error(processError)
      }

      function renderAgentStep(step: AgentStep): string {
        const { response, toolCalls, toolResults } = step
        return [
          `\`\`\`text_response\n${response}\n\`\`\``,
          `\`\`\`tool_calls\n${JSON.stringify(toolCalls, null, 2)}\n\`\`\``,
          `\`\`\`tool_results\n${JSON.stringify(toolResults, null, 2)}\n\`\`\``,
        ].join('\n\n')
      }
      const renderedTrace = trace
        .map(
          ({ prompt, steps }) =>
            `You: ${prompt}\n\nCodebuff:${steps.map(renderAgentStep).join('\n\n')}`,
        )
        .join('\n\n')

      // Get next prompt from prompting agent with timeout
      let agentResponse: z.infer<typeof AgentDecisionSchema>
      try {
        agentResponse = !promptWithAgent
          ? {
              decision: 'continue',
              reasoning: 'Using spec as sole prompt',
              next_prompt: evalCommit.spec,
            }
          : await promptAiSdkStructured({
              messages: [
                {
                  role: 'user',
                  content: `You are an expert software engineer tasked with implementing a specification using CodeBuff, an AI coding assistant. Your goal is to prompt CodeBuff to implement the spec correctly. You are in a conversation with this coding agent.

Current spec to implement:
<spec>${evalCommit.spec}</spec>

Your conversation with Codebuff so far:
<conversation>${renderedTrace}</conversation>

Note that files can only be changed with tools. If no tools are called, no files were changed.

You must decide whether to:
1. 'continue' - Generate a follow-up prompt for Codebuff
2. 'complete' - The implementation is done and fully satisfies the spec, including tests, documentation, and any other relevant artifacts
  - In this case, just put an empty string for next_prompt
3. 'halt' - The implementation is off track and unlikely to be completed within ${MAX_ATTEMPTS - attempts} more attempts
  - In this case, just put an empty string for next_prompt

If deciding to continue, include a clear, focused prompt for Codebuff in next_prompt. Note that Codebuff does not have access to the spec, so you must describe the changes you want Codebuff to make in a way that is clear and concise.
Explain your reasoning in detail. Do not ask Codebuff to git commit changes.`,
                },
              ],
              schema: AgentDecisionSchema,
              model: 'x-ai/grok-4-fast',
              clientSessionId,
              fingerprintId,
              userInputId: generateCompactId(),
              userId: undefined,
              timeout: 5 * 60_000, // 5 minute timeout
              sendAction: () => {},
              liveUserInputRecord: {},
              sessionConnections: {},
              logger: console,
              trackEvent: () => {},
            })
      } catch (agentError) {
        throw new Error(
          `Agent decision failed: ${agentError instanceof Error ? `${agentError.message}\n${JSON.stringify(agentError)}\n${agentError.stack}` : String(agentError)}`,
        )
      }

      console.log('Agent decision:', agentResponse.decision)
      console.log('Agent reasoning:', agentResponse.reasoning)
      console.log('Agent prompt:', agentResponse.next_prompt)

      // If continuing, run CodeBuff with the agent's prompt
      if (agentResponse.decision === 'continue') {
        const prompt = agentResponse.next_prompt || 'continue'

        // Use loopMainPrompt with timeout wrapper
        const codebuffResult = await withTimeout(
          runner.run(prompt),
          // Timeout after 30 minutes
          60_000 * 30,
        )

        // Track credits used
        totalCostUsd += codebuffResult.totalCostUsd
        trace.push({ prompt, steps: codebuffResult.steps })
      }

      currentDecision = agentResponse.decision
      attempts++
    }
  } catch (e) {
    console.error('Error in runSingleEval:', e)
    error =
      e instanceof Error
        ? `${e.message}\n${e.stack}`
        : `Unknown error: ${String(e)}`
  } finally {
    // Clean up process-level error handlers
    process.removeListener('uncaughtException', uncaughtHandler)
    process.removeListener('unhandledRejection', unhandledHandler)

    // Restore original handlers
    originalUncaughtHandler.forEach((handler) => {
      if (typeof handler === 'function') {
        process.on('uncaughtException', handler)
      }
    })
    originalUnhandledHandler.forEach((handler) => {
      if (typeof handler === 'function') {
        process.on('unhandledRejection', handler)
      }
    })
  }

  // If we caught a process-level error, use that
  if (processError && !error) {
    error = processError
  }

  const endTime = new Date()
  const durationMs = endTime.getTime() - startTime.getTime()

  const fileStates = getCodebuffFileStates(evalCommit, projectPath)

  if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
    fs.rmSync(projectPath, { recursive: true, force: true })
  }

  const evalRun: EvalRunLog = {
    eval_commit: evalCommit,
    trace,
    error,
    gitDiff: fileStates,
    durationMs,
    costUsd: totalCostUsd,
  }

  // Add judging results even for failed runs
  try {
    const judgingResults = await judgeEvalRun(evalRun)
    console.log('Judging results:', judgingResults)

    const result = {
      ...evalRun,
      judging_results: judgingResults,
      computed_metrics: {
        runtime_sec: durationMs / 1000,
        cost_usd: totalCostUsd,
      },
    }

    return result
  } catch (judgingError) {
    console.error('Error in judging:', judgingError)
    // Return without judging results if judging fails

    return {
      ...evalRun,
      judging_results: {
        analysis: `Judging failed due to error:\n${JSON.stringify(
          judgingError instanceof Error
            ? getErrorObject(judgingError)
            : judgingError,
        )}`,
        strengths: [],
        weaknesses: ['Judging process encountered an error'],
        metrics: {
          completionScore: 0,
          codeQualityScore: 0,
          overallScore: 0,
        },
      },
      computed_metrics: {
        runtime_sec: durationMs / 1000,
        cost_usd: totalCostUsd,
      },
    }
  }
}

function writeJsonToFile(json: any, path: string) {
  fs.writeFileSync(path, JSON.stringify(json, null, 2))
}

function getCodebuffFileStates(
  evalCommit: EvalCommit,
  projectPath: string,
): string {
  execFileSync('git', ['add', '.'], { cwd: projectPath, stdio: 'ignore' })

  return execFileSync('git', ['diff', evalCommit.parentSha], {
    cwd: projectPath,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()
}

export function mockRunGitEvals(path: string) {
  const result = JSON.parse(fs.readFileSync(path, 'utf-8')) as FullEvalLog

  return result
}

// Global concurrency limiter that can be shared across multiple repository evaluations
let globalConcurrencyLimiter: ReturnType<typeof pLimit> | null = null

// Track all active child processes for cleanup
const activeChildProcesses = new Set<ChildProcess>()
let isCleaningUp = false

export function setGlobalConcurrencyLimit(limit: number) {
  globalConcurrencyLimiter = pLimit(limit)
}

/**
 * Terminates all active evaluation child processes
 */
export async function terminateAllEvalChildren(): Promise<void> {
  if (isCleaningUp || activeChildProcesses.size === 0) {
    return
  }

  isCleaningUp = true
  console.log(
    `\nTerminating ${activeChildProcesses.size} active evaluation processes...`,
  )

  const killPromises = Array.from(activeChildProcesses).map(async (child) => {
    if (!child.pid || child.killed) {
      return
    }

    try {
      // First try graceful termination
      if (process.platform === 'win32') {
        // Windows: kill process tree
        execFileSync('taskkill', ['/PID', String(child.pid), '/T'], {
          stdio: 'ignore',
          timeout: 3000,
        })
      } else {
        // POSIX: kill process group
        process.kill(-child.pid, 'SIGTERM')
      }

      // Wait a bit for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Force kill if still alive
      if (!child.killed) {
        if (process.platform === 'win32') {
          execFileSync('taskkill', ['/F', '/PID', String(child.pid), '/T'], {
            stdio: 'ignore',
            timeout: 1000,
          })
        } else {
          process.kill(-child.pid, 'SIGKILL')
        }
      }
    } catch (error) {
      // Process may have already exited
      console.warn(`Failed to kill process ${child.pid}:`, error)
    }
  })

  await Promise.allSettled(killPromises)
  activeChildProcesses.clear()
  isCleaningUp = false
}

export async function runGitEvals(
  evalDataPath: string,
  outputDir: string,
  codingAgent: 'codebuff' | 'claude',
  limit?: number,
  logToStdout: boolean = false,
  agent: string = 'base',
  worktreePath?: string,
  promptWithAgent: boolean = false,
): Promise<FullEvalLog> {
  // Set up signal handlers if this is the main module
  if (require.main === module) {
    const signalHandler = async (signal: string) => {
      console.log(`\nReceived ${signal}, cleaning up...`)
      await terminateAllEvalChildren()
      process.exit(signal === 'SIGINT' ? 130 : 143)
    }

    process.on('SIGINT', () => signalHandler('SIGINT'))
    process.on('SIGTERM', () => signalHandler('SIGTERM'))
  }
  console.log(`Loading eval data from: ${evalDataPath}`)
  const evalData = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8'),
  ) as EvalData

  console.log(
    `Loaded ${evalData.evalCommits.length} eval commits from ${evalDataPath}`,
  )

  const { repoUrl } = evalData

  // Extract repo name from URL or use provided testRepoName as fallback
  const testRepoName = evalData.testRepoName || extractRepoNameFromUrl(repoUrl)

  const clientSessionId = generateCompactId()
  const fingerprintId = generateCompactId()

  // Generate unique trace ID for this run
  const traceId = generateCompactId()
  console.log(`Starting eval run with trace ID: ${traceId}`)

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const logsDir = path.join(outputDir, 'logs', `${testRepoName}-${traceId}`)
  fs.mkdirSync(logsDir, { recursive: true })

  const commitsToRun = limit
    ? evalData.evalCommits.slice(0, limit)
    : evalData.evalCommits

  console.log(
    `Running ${commitsToRun.length} evaluations out of ${evalData.evalCommits.length} total commits...`,
  )
  console.log(
    `Using concurrency limit: ${globalConcurrencyLimiter ? 'global limiter' : 'local limiter (20)'}`,
  )

  // Use global limiter if available, otherwise create a local one
  const limitConcurrency = globalConcurrencyLimiter || pLimit(20)

  const timeoutMs = 60_000 * 30
  const evalPromises = commitsToRun.map((evalCommit, index) => {
    return limitConcurrency(() =>
      withTimeout(
        new Promise<EvalRunJudged>(async (resolve, reject) => {
          try {
            console.log(
              `Setting up test repository for commit ${evalCommit.sha}...`,
            )
            const projectPath = await setupTestRepo(
              repoUrl,
              testRepoName,
              evalCommit.sha,
              true,
              evalData.initCommand,
              evalCommit.parentSha,
            )

            console.log(
              `Starting ${testRepoName} eval ${index + 1}/${commitsToRun.length} for commit ${evalCommit.spec.split('\n')[0]}...`,
            )

            const safeMessage = evalCommit.spec
              .split('\n')[0]
              .replace(/[^a-zA-Z0-9]/g, '_')
              .slice(0, 30)
            const date = new Date().toISOString().replace(/[:.]/g, '-')
            const logFilename = `${date}-${safeMessage}-${evalCommit.sha.slice(0, 7)}.log`
            const logPath = path.join(logsDir, logFilename)
            const logStream = logToStdout
              ? process.stdout
              : fs.createWriteStream(logPath)

            // Write evalCommit to temporary file to avoid long command line arguments
            // Use absolute path so it works from worktree too
            const tempEvalCommitPath = path.resolve(
              logsDir,
              `eval-commit-${evalCommit.sha.slice(0, 7)}.json`,
            )
            fs.writeFileSync(tempEvalCommitPath, JSON.stringify(evalCommit))

            // Resolve the process script path relative to worktree if provided
            const processScriptPath = worktreePath
              ? path.join(
                  worktreePath,
                  'evals',
                  'git-evals',
                  'run-single-eval-process.ts',
                )
              : path.resolve(__dirname, 'run-single-eval-process.ts')

            const child = fork(
              processScriptPath,
              [
                tempEvalCommitPath,
                projectPath,
                clientSessionId,
                fingerprintId,
                codingAgent,
                agent,
                promptWithAgent.toString(),
              ],
              {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                env: process.env,
                detached: true, // Create new process group for proper signal handling
                // Set cwd to worktree so relative imports work correctly
                ...(worktreePath ? { cwd: worktreePath } : {}),
              },
            )

            // Track child process for cleanup
            activeChildProcesses.add(child)

            child.stdout?.pipe(logStream)
            child.stderr?.pipe(logStream)

            child.on(
              'message',
              (message: {
                type: string
                result?: EvalRunJudged
                error?: any
              }) => {
                // Clean up temp file
                try {
                  fs.unlinkSync(tempEvalCommitPath)
                } catch (e) {
                  console.warn(
                    `Failed to clean up temp file ${tempEvalCommitPath}:`,
                    e,
                  )
                }
                if (message.type === 'result' && message.result) {
                  console.log(
                    `Completed eval for commit ${testRepoName} - ${evalCommit.spec.split('\n')[0]}`,
                  )

                  // Repeat spec before printing judge ruling
                  console.log(`Spec for commit ${testRepoName}:`)
                  console.log(evalCommit.spec)

                  // Print GitHub commit link after judging results
                  try {
                    const githubUrl = createGithubUrl(repoUrl, evalCommit.sha)
                    console.log(`GitHub commit: ${githubUrl}`)
                  } catch (error) {
                    // Ignore errors if URL generation fails (e.g., non-GitHub repos)
                  }

                  if (!logToStdout) {
                    const finalResult = cloneDeep(message.result)
                    for (const cbTrace of finalResult.trace) {
                      delete (cbTrace as any).steps
                    }
                    delete (finalResult.eval_commit as any).fileStates
                    console.log(`${JSON.stringify(finalResult, null, 2)}`)
                  }
                  resolve(message.result)
                } else if (message.type === 'error') {
                  console.error(
                    `Received error while running eval: ${message.error.stack}\n`,
                    { message },
                  )
                  const err = new Error(message.error.message)
                  reject(err)
                }
              },
            )

            child.on('exit', (code) => {
              // Remove from tracking
              activeChildProcesses.delete(child)

              if (!logToStdout && logStream !== process.stdout) {
                logStream.end()
              }

              if (code !== 0) {
                console.error(
                  `Eval process for ${evalCommit.sha} exited with code ${code}. See logs at ${logPath}`,
                )
                reject(
                  new Error(
                    `Eval process for ${evalCommit.sha} exited with code ${code}`,
                  ),
                )
              }
            })
          } catch (error) {
            console.error(
              `Error while running git eval for ${testRepoName} commit ${evalCommit.sha}`,
              { error },
            )
            reject(error)
          }
        }),
        timeoutMs,
      ),
    )
  })

  const results = await Promise.allSettled(evalPromises)

  console.log(
    `Promise.allSettled completed. Results: ${results.length} total, ${results.filter((r) => r.status === 'fulfilled').length} fulfilled, ${results.filter((r) => r.status === 'rejected').length} rejected`,
  )

  // Log rejected promises for debugging
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `❌ Eval ${index + 1}/${commitsToRun.length} (${commitsToRun[index].sha}) was rejected:`,
        result.reason,
      )
    }
  })

  const evalRuns = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)

  // Calculate final overall metrics
  const overallMetrics = calculateOverallMetrics(evalRuns)

  const result: FullEvalLog = {
    test_repo_name: testRepoName,
    generation_date: new Date().toISOString(),
    eval_runs: evalRuns,
    overall_metrics: overallMetrics,
  }

  // Create final filename with trace ID
  const finalOutputPath = path.join(
    outputDir,
    `eval-result-${testRepoName}-${traceId}.json`,
  )

  // Write final results to file
  fs.writeFileSync(finalOutputPath, JSON.stringify(result, null, 2))

  console.log('All evals complete!')
  console.log(`Final results written to ${finalOutputPath}`)

  return result
}

function calculateOverallMetrics(evalRuns: EvalRunJudged[]) {
  return {
    average_runtime_sec:
      evalRuns.reduce(
        (sum, run) => sum + (run.computed_metrics?.runtime_sec || 0),
        0,
      ) / evalRuns.length,
    average_cost_usd:
      evalRuns.reduce(
        (sum, run) => sum + (run.computed_metrics?.cost_usd || 0),
        0,
      ) / evalRuns.length,
    average_completion:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.completionScore || 0),
        0,
      ) / evalRuns.length,
    average_code_quality:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.codeQualityScore || 0),
        0,
      ) / evalRuns.length,
    average_overall:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.overallScore || 0),
        0,
      ) / evalRuns.length,
    average_duration_ms:
      evalRuns.reduce((sum, run) => sum + run.durationMs, 0) / evalRuns.length,
    total_runs: evalRuns.length,
    successful_runs: evalRuns.filter((run) => !run.error).length,
    failed_runs: evalRuns.filter((run) => run.error).length,
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  console.info(
    'Usage: bun run run-git-eval [eval-data-path] [output-dir] [coding-agent]',
  )

  const evalDataPath = args[0] || 'git-evals/git-evals.json'
  const outputDir = args[1] || 'git-evals'
  const codingAgent = args[2] || 'codebuff'
  if (!['codebuff', 'claude'].includes(codingAgent)) {
    throw new Error(`Invalid coding agent: ${codingAgent}`)
  }

  runGitEvals(evalDataPath, outputDir, codingAgent as 'codebuff' | 'claude')
    .then(() => {
      console.log('Done!')
      process.exit(0)
    })
    .catch((err) => {
      console.error('Error running evals:', err)
      process.exit(1)
    })
}
