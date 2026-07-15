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
  FinalCheckCommand,
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
  finalCheckCommands?: FinalCheckCommand[]
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
  commands: readonly FinalCheckCommand[],
  cwd: string,
  env?: Record<string, string>,
  signal?: AbortSignal,
  options: {
    concurrency?: number
    defaultTimeoutMs?: number
  } = {},
): Promise<FinalCheckOutput[]> {
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4))
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000
  const checks = commands.map((entry, index) => {
    const legacy = typeof entry === 'string'
    const spec = typeof entry === 'string' ? undefined : entry
    const id = spec?.id ?? `check-${index + 1}`
    return {
      id,
      command: typeof entry === 'string' ? entry : entry.command,
      // Preserve historical ordering for string arrays. Object checks only
      // serialize when the configuration declares a dependency.
      dependsOn:
        legacy && index > 0 ? [`check-${index}`] : (spec?.dependsOn ?? []),
      timeoutMs: spec?.timeoutMs ?? defaultTimeoutMs,
      index,
    }
  })

  const byId = new Map<string, (typeof checks)[number]>()
  const results = new Map<string, FinalCheckOutput>()
  for (const check of checks) {
    if (!check.id.trim() || byId.has(check.id)) {
      results.set(check.id || `check-${check.index + 1}`, {
        checkId: check.id || undefined,
        command: check.command,
        dependsOn: check.dependsOn,
        exitCode: 2,
        outcome: 'configuration_error',
        durationMs: 0,
        stdout: '',
        stderr: `Invalid or duplicate final-check id: ${JSON.stringify(check.id)}`,
      })
      continue
    }
    byId.set(check.id, check)
  }

  const pending = new Set(
    checks.filter((check) => !results.has(check.id)).map((check) => check.id),
  )
  while (pending.size > 0) {
    const unknownDependency = [...pending]
      .map((id) => byId.get(id)!)
      .find((check) =>
        check.dependsOn.some((dependency) => !byId.has(dependency)),
      )
    if (unknownDependency) {
      const missing = unknownDependency.dependsOn.filter(
        (dependency) => !byId.has(dependency),
      )
      results.set(unknownDependency.id, {
        checkId: unknownDependency.id,
        command: unknownDependency.command,
        dependsOn: unknownDependency.dependsOn,
        exitCode: 2,
        outcome: 'configuration_error',
        durationMs: 0,
        stdout: '',
        stderr: `Unknown final-check dependencies: ${missing.join(', ')}`,
      })
      pending.delete(unknownDependency.id)
      continue
    }

    const ready = [...pending]
      .map((id) => byId.get(id)!)
      .filter((check) =>
        check.dependsOn.every((dependency) => results.has(dependency)),
      )
    if (ready.length === 0) {
      for (const id of pending) {
        const check = byId.get(id)!
        results.set(id, {
          checkId: id,
          command: check.command,
          dependsOn: check.dependsOn,
          exitCode: 2,
          outcome: 'configuration_error',
          durationMs: 0,
          stdout: '',
          stderr: 'Final-check dependency cycle detected.',
        })
      }
      pending.clear()
      break
    }

    for (let start = 0; start < ready.length; start += concurrency) {
      const batch = ready.slice(start, start + concurrency)
      const batchResults = await Promise.all(
        batch.map(async (check): Promise<[string, FinalCheckOutput]> => {
          const failedDependency = check.dependsOn.find(
            (dependency) => results.get(dependency)?.outcome !== 'passed',
          )
          if (failedDependency) {
            return [
              check.id,
              {
                checkId: check.id,
                command: check.command,
                dependsOn: check.dependsOn,
                exitCode: 125,
                outcome: 'skipped',
                durationMs: 0,
                stdout: '',
                stderr: `Skipped because dependency ${failedDependency} did not pass.`,
              },
            ]
          }
          return [check.id, await runFinalCheckCommand(check, cwd, env, signal)]
        }),
      )
      for (const [id, result] of batchResults) {
        results.set(id, result)
        pending.delete(id)
      }
    }
  }

  return checks.map((check) => results.get(check.id)!).filter(Boolean)
}

async function runFinalCheckCommand(
  check: {
    id: string
    command: string
    dependsOn: string[]
    timeoutMs: number
  },
  cwd: string,
  env: Record<string, string> | undefined,
  parentSignal: AbortSignal | undefined,
): Promise<FinalCheckOutput> {
  const startedAt = Date.now()
  const controller = new AbortController()
  let timedOut = false
  const cancelFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) cancelFromParent()
  else parentSignal?.addEventListener('abort', cancelFromParent, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(
      new Error(`Final check timed out after ${check.timeoutMs}ms`),
    )
  }, check.timeoutMs)

  console.log(`  Running [${check.id}]: ${check.command}`)
  try {
    const { stdout, stderr } = await execAsync(check.command, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...env },
      signal: controller.signal,
    })
    console.log(`  ✓ Command succeeded [${check.id}]: ${check.command}`)
    return {
      checkId: check.id,
      command: check.command,
      dependsOn: check.dependsOn,
      exitCode: 0,
      outcome: 'passed',
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
    }
  } catch (error: any) {
    const aborted = isAbortError(error) || controller.signal.aborted
    const outcome = aborted ? (timedOut ? 'timed_out' : 'cancelled') : 'failed'
    const exitCode =
      typeof error.code === 'number'
        ? error.code
        : outcome === 'timed_out'
          ? 124
          : outcome === 'cancelled'
            ? 130
            : 1
    console.log(
      `  ✗ Command ${outcome} (exit ${exitCode}) [${check.id}]: ${check.command}`,
    )
    return {
      checkId: check.id,
      command: check.command,
      dependsOn: check.dependsOn,
      exitCode,
      outcome,
      durationMs: Date.now() - startedAt,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr:
        typeof error.stderr === 'string' && error.stderr
          ? error.stderr
          : String(controller.signal.reason ?? error.message ?? error),
    }
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', cancelFromParent)
  }
}
