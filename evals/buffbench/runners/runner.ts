import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

export type AgentStep = PrintModeEvent

export type RunnerResult = {
  steps: AgentStep[]
  totalCostUsd: number
  diff: string
}

export type RunnerOptions = {
  signal?: AbortSignal
}

export interface Runner {
  run: (prompt: string, options?: RunnerOptions) => Promise<RunnerResult>
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { name?: unknown; code?: unknown }
  return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR'
}

export function createExternalRunnerAbortError(runnerName: string): Error {
  return new Error(`${runnerName} CLI run aborted by timeout or cancellation.`)
}
