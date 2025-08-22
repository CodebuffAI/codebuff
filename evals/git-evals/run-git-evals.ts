import { execFileSync, fork } from 'child_process'
import fs from 'fs'
import path from 'path'

import { disableLiveUserInputCheck } from '@codebuff/backend/live-user-inputs'
import { promptAiSdkStructured } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'
import pLimit from 'p-limit'

import { resetRepoToCommit } from '../scaffolding'
import { createInitialSessionState } from '../test-setup'
import { judgeEvalRun } from './judge-git-eval'
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
import type { z } from 'zod/v4'

disableLiveUserInputCheck()

// Try Gemini!
const AGENT_TYPE = AgentTemplateTypes.base

const EDIT_FILE_TOOL_NAMES = ['write_file', 'str_replace'] as const

export async function runSingleEval(
  evalCommit: EvalCommit,
  projectPath: string,
  clientSessionId: string,
  fingerprintId: string,
  codingAgent: 'codebuff' | 'claude',
): Promise<EvalRunJudged> {
  const startTime = new Date()
  const trace: CodebuffTrace[] = []
  let error: string | undefined

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
    processError = `Unhandled rejection: ${reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason)}`
  }

  process.on('uncaughtException', uncaughtHandler)
  process.on('unhandledRejection', unhandledHandler)

  try {
    // Reset to the commit before the target commit
    resetRepoToCommit(projectPath, `${evalCommit.sha}^`)

    // Initialize state
    let runner: Runner
    if (codingAgent === 'codebuff') {
      runner = new CodebuffRunner({
        sessionState: await createInitialSessionState(projectPath),
        toolResults: [],
      })
    } else if (codingAgent === 'claude') {
      runner = new ClaudeRunner(projectPath)
    } else {
      codingAgent satisfies never
      throw new Error('Unknown coding agent')
    }

    let currentDecision: AgentDecision = 'continue'
    let attempts = 0
    const MAX_ATTEMPTS = 5

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

      // Get next prompt from Sonnet agent with timeout
      let agentResponse: z.infer<typeof AgentDecisionSchema>
      try {
        agentResponse = await promptAiSdkStructured({
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
2. 'complete' - The implementation is done and satisfies the spec
3. 'halt' - The implementation is off track and unlikely to be completed within ${MAX_ATTEMPTS - attempts} more attempts

If deciding to continue, include a clear, focused prompt for Codebuff in next_prompt.
Explain your reasoning in detail.`,
            },
          ],
          schema: AgentDecisionSchema,
          model: models.gemini2_5_flash,
          clientSessionId,
          fingerprintId,
          userInputId: generateCompactId(),
          userId: undefined,
          timeout: 5 * 60_000, // 5 minute timeout
        })
      } catch (agentError) {
        throw new Error(
          `Agent decision failed: ${agentError instanceof Error ? agentError.message : String(agentError)}`,
        )
      }

      console.log('Agent decision:', agentResponse.decision)
      console.log('Agent reasoning:', agentResponse.reasoning)
      console.log('Agent prompt:', agentResponse.next_prompt)

      if (agentResponse.decision === 'continue' && !agentResponse.next_prompt) {
        agentResponse.next_prompt = 'continue'
      }

      // If continuing, run CodeBuff with the agent's prompt
      if (agentResponse.decision === 'continue') {
        const prompt = agentResponse.next_prompt!

        // Use loopMainPrompt with timeout wrapper
        const codebuffResult = await withTimeout(
          runner.run(prompt),
          // Timeout after 30 minutes
          60_000 * 30,
        )

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

    if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  }

  // If we caught a process-level error, use that
  if (processError && !error) {
    error = processError
  }

  const endTime = new Date()
  const durationMs = endTime.getTime() - startTime.getTime()

  const fileStates = getCodebuffFileStates(trace, evalCommit.sha, projectPath)

  const evalRun: EvalRunLog = {
    eval_commit: evalCommit,
    trace,
    error,
    gitDiff: fileStates,
    durationMs,
  }

  // Add judging results even for failed runs
  try {
    const judgingResults = await judgeEvalRun(evalRun)
    console.log('Judging results:', judgingResults)
    return {
      ...evalRun,
      judging_results: judgingResults,
    }
  } catch (judgingError) {
    console.error('Error in judging:', judgingError)
    // Return without judging results if judging fails
    return {
      ...evalRun,
      judging_results: {
        analysis: 'Judging failed due to error',
        strengths: [],
        weaknesses: ['Judging process encountered an error'],
        metrics: {
          completionScore: 0,
          efficiencyScore: 0,
          codeQualityScore: 0,
          overallScore: 0,
        },
      },
    }
  }
}

function getCodebuffFileStates(
  trace: CodebuffTrace[],
  evalCommitSha: string,
  projectPath: string,
): string {
  return execFileSync('git', ['diff', `${evalCommitSha}^`], {
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

export function setGlobalConcurrencyLimit(limit: number) {
  globalConcurrencyLimiter = pLimit(limit)
}

export async function runGitEvals(
  evalDataPath: string,
  outputDir: string,
  codingAgent: 'codebuff' | 'claude',
  limit?: number,
  logToStdout: boolean = false,
): Promise<FullEvalLog> {
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

  // Generate filenames with trace ID (single file that gets overwritten)
  const partialOutputPath = path.join(
    outputDir,
    `eval-partial-${testRepoName}-${traceId}.json`,
  )

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

  const evalPromises = commitsToRun.map((evalCommit, index) => {
    return limitConcurrency(
      () =>
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
            )

            console.log(
              `Starting ${testRepoName} eval ${index + 1}/${commitsToRun.length} for commit ${evalCommit.spec.split('\n')[0]}...`,
            )

            const safeMessage = evalCommit.spec
              .split('\n')[0]
              .replace(/[^a-zA-Z0-9]/g, '_')
              .slice(0, 30)
            const logFilename = `${safeMessage}-${evalCommit.sha.slice(0, 7)}.log`
            const logPath = path.join(logsDir, logFilename)
            const logStream = logToStdout
              ? process.stdout
              : fs.createWriteStream(logPath)

            // Write evalCommit to temporary file to avoid long command line arguments
            const tempEvalCommitPath = path.join(
              logsDir,
              `eval-commit-${evalCommit.sha.slice(0, 7)}.json`,
            )
            fs.writeFileSync(tempEvalCommitPath, JSON.stringify(evalCommit))

            const child = fork(
              path.resolve(__dirname, 'run-single-eval-process.ts'),
              [
                tempEvalCommitPath,
                projectPath,
                clientSessionId,
                fingerprintId,
                codingAgent,
              ],
              { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], env: process.env },
            )

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
                  if (!logToStdout) {
                    console.log(`${JSON.stringify(message.result, null, 2)}`)
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
              logStream.end()
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
    average_completion:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.completionScore || 0),
        0,
      ) / evalRuns.length,
    average_efficiency:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.efficiencyScore || 0),
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
