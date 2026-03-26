import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

export type AgentStep = PrintModeEvent

export type RunnerResult = {
  steps: AgentStep[]
  totalCostUsd: number
  diff: string
}

export interface Runner {
  run: (prompt: string) => Promise<RunnerResult>
}
