import { execSync, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

import { withTimeout } from '@codebuff/common/util/promise'

import { withTestRepo } from '../subagents/test-repo-utils'
import {
  computeCacheUsageMetrics,
  evaluateCacheRecall,
} from './cache-recall-eval'
import { computeRetrievalFlowMetrics } from './retrieval-flow-metrics'
import { ClaudeRunner } from './runners/claude'
import { CodebuffRunner } from './runners/codebuff'
import { CodexRunner } from './runners/codex'
import { OpenCodeRunner } from './runners/opencode'

import { isAbortError, type Runner, type AgentStep } from './runners/runner'
import type {
  CacheRecallEvalConfig,
  CacheRecallEvalResult,
  EvalCommitV2,
  FinalCheckOutput,
} from './types'
import type { OpenbuffClient } from '@openbuff/sdk'

export type { AgentStep }

export type ExternalAgentType = 'claude' | 'codex' | 'opencode'

export async function runWithTimeoutSignal<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController()
  return withTimeout(
    Promise.resolve().then(() => operation(controller.signal)),
    timeoutMs,
    timeoutMessage,
    { controller },
  )
}

export async function runAgentOnCommit({
  client,
  agentId,
  commit,
  repoUrl,
  initCommand,
  env,
  localAgentDefinitions,
  printEvents,
  finalCheckCommands,
  cacheRecallEval,
  externalAgentType,
}: {
  client: OpenbuffClient
  agentId: string
  commit: EvalCommitV2
  repoUrl: string
  initCommand?: string
  env?: Record<string, string>
  localAgentDefinitions: any[]
  printEvents: boolean
  finalCheckCommands?: string[]
  cacheRecallEval?: CacheRecallEvalConfig
  externalAgentType?: ExternalAgentType
}): Promise<{
  diff: string
  contextFiles: Record<string, string>
  durationMs: number
  cost: number
  error?: string
  trace: AgentStep[]
  finalCheckOutputs?: FinalCheckOutput[]
  cacheRecallEval?: CacheRecallEvalResult
  retrievalFlow: ReturnType<typeof computeRetrievalFlowMetrics>
}> {
  console.log(`[${commit.id}] Running agent ${agentId}...`)
  const startTime = Date.now()
  let diff = ''
  let contextFiles: Record<string, string> = {}
  let error: string | undefined
  let cost = 0
  const trace: AgentStep[] = []
  let finalCheckOutputs: FinalCheckOutput[] | undefined
  let cacheRecallEvalResult: CacheRecallEvalResult | undefined

  try {
    const timeoutMs = 60 * 60 * 1000 // 60 minutes
    await runWithTimeoutSignal(
      async (timeoutSignal) =>
        withTestRepo(
          {
            repoUrl,
            parentSha: commit.parentSha,
            initCommand,
            env,
          },
          async (repoDir) => {
            // Select the appropriate runner
            let runner: Runner
            if (externalAgentType === 'claude') {
              runner = new ClaudeRunner(repoDir, env)
            } else if (externalAgentType === 'codex') {
              runner = new CodexRunner(repoDir, env)
            } else if (externalAgentType === 'opencode') {
              runner = new OpenCodeRunner(repoDir, env)
            } else {
              runner = new CodebuffRunner({
                cwd: repoDir,
                env,
                client,
                agentId,
                localAgentDefinitions,
                printEvents,
                commitId: commit.id,
                parentSha: commit.parentSha,
              })
            }

            console.log(
              `[${commit.id}] Running agent: ${externalAgentType || 'codebuff'}`,
            )

            const result = await runner.run(commit.prompt, {
              signal: timeoutSignal,
            })
            trace.push(...result.steps)
            cost = result.totalCostUsd
            diff = result.diff

            if (cacheRecallEval) {
              cacheRecallEvalResult = evaluateCacheRecall({
                config: cacheRecallEval,
                cacheUsage:
                  result.cachedInputTokens !== undefined &&
                  result.inputTokens !== undefined
                    ? computeCacheUsageMetrics({
                        cachedInputTokens: result.cachedInputTokens,
                        inputTokens: result.inputTokens,
                      })
                    : undefined,
                finalMessageHistoryText: result.finalMessageHistoryText,
              })
            }

            const contextFilePaths = new Set<string>([
              ...commit.supplementalFiles,
              ...commit.fileDiffs.map((fd) => fd.path),
            ])
            for (const { status, path } of commit.fileDiffs) {
              if (status === 'added') {
                contextFilePaths.delete(path)
              }
            }

            for (const filePath of contextFilePaths) {
              try {
                const content = execSync(
                  `git show ${commit.parentSha}:${JSON.stringify(filePath)}`,
                  {
                    cwd: repoDir,
                    encoding: 'utf-8',
                    maxBuffer: 10 * 1024 * 1024,
                  },
                )
                contextFiles[filePath] = content
              } catch (error) {
                contextFiles[filePath] = ''
              }
            }

            // Run final check commands if specified
            const resolvedFinalCheckCommands =
              commit.finalCheckCommands ?? finalCheckCommands
            if (
              resolvedFinalCheckCommands &&
              resolvedFinalCheckCommands.length > 0
            ) {
              console.log(
                `[${commit.id}] Running ${resolvedFinalCheckCommands.length} final check commands...`,
              )
              finalCheckOutputs = await runFinalCheckCommands(
                resolvedFinalCheckCommands,
                repoDir,
                env,
                timeoutSignal,
              )
            }

            if (cacheRecallEvalResult) {
              finalCheckOutputs = [
                ...(finalCheckOutputs ?? []),
                cacheRecallEvalToFinalCheckOutput(cacheRecallEvalResult),
              ]
            }
          },
        ),
      timeoutMs,
      `Agent ${agentId} timed out after ${timeoutMs / 1000} seconds`,
    )
  } catch (e) {
    error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
  }

  const durationMs = Date.now() - startTime

  return {
    diff,
    contextFiles,
    durationMs,
    cost,
    error,
    trace,
    finalCheckOutputs,
    cacheRecallEval: cacheRecallEvalResult,
    retrievalFlow: computeRetrievalFlowMetrics({
      trace,
      expectedPaths: [
        ...commit.supplementalFiles,
        ...commit.fileDiffs
          .filter((file) => file.status !== 'added')
          .map((file) => file.path),
      ],
    }),
  }
}

export function cacheRecallEvalToFinalCheckOutput(
  result: CacheRecallEvalResult,
): FinalCheckOutput {
  return {
    command: result.recallEvaluated
      ? 'buffbench cache-recall eval'
      : 'buffbench cache-usage eval',
    exitCode: result.passed ? 0 : 1,
    outcome: result.passed ? 'passed' : 'failed',
    stdout: JSON.stringify(result, null, 2),
    stderr: result.failureReason ?? '',
  }
}

export async function runFinalCheckCommands(
  commands: string[],
  cwd: string,
  env?: Record<string, string>,
  signal?: AbortSignal,
): Promise<FinalCheckOutput[]> {
  const results: FinalCheckOutput[] = []

  for (const command of commands) {
    console.log(`  Running: ${command}`)
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, ...env },
        signal,
      })
      results.push({
        command,
        exitCode: 0,
        outcome: 'passed',
        stdout,
        stderr,
      })
      console.log(`  ✓ Command succeeded: ${command}`)
    } catch (error: any) {
      // Command failed, but we still capture the output
      const exitCode = typeof error.code === 'number' ? error.code : 1
      const aborted = isAbortError(error) || signal?.aborted === true
      const abortReason = String(signal?.reason ?? error?.message ?? '')
      const outcome = aborted
        ? /timed?\s*out|timeout/i.test(abortReason)
          ? 'timed_out'
          : 'cancelled'
        : 'failed'
      results.push({
        command,
        exitCode,
        outcome,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      })
      console.log(`  ✗ Command failed (exit ${exitCode}): ${command}`)
    }
  }

  return results
}
