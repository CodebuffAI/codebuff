import type { AgentStep } from '../agent-runner'

export type RunnerResult = {
  steps: AgentStep[]
  totalCostUsd: number
  diff: string
}

export type Runner = {
  run: (prompt: string) => Promise<RunnerResult>
}
