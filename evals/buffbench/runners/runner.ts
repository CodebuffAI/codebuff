import type {
  AgentUsageData,
  ContextCompactionData,
} from '@codebuff/common/types/contracts/llm'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

export type AgentStep = PrintModeEvent

/** One model request's provider usage, or one compaction pass, in run order.
 *  `inputTokens` is the whole prompt (cached included), which is what a
 *  long-context price tier is keyed on. */
export type ContextLogEntry =
  | ({ type: 'usage' } & AgentUsageData)
  | ({ type: 'compaction' } & Omit<ContextCompactionData, 'summary'>)

export type RunnerResult = {
  steps: AgentStep[]
  totalCostUsd: number
  diff: string
  /** Codebuff runs only. */
  contextLog?: ContextLogEntry[]
  /** Why the run ended early, when it did: the SDK's error message. A run that
   *  died with no edits is then recorded as a failure, not as an agent that
   *  chose to change nothing. */
  error?: string
}

export interface Runner {
  run: (prompt: string) => Promise<RunnerResult>
}
