import { trimMessagesToFitTokenLimit } from './messages'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Default maximum context tokens before auto-pruning triggers. Matches the
 * default in `trimMessagesToFitTokenLimit` (190k), which is a safe threshold
 * for most models' context windows.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 190_000

/**
 * Proactively prune message history when the total context token count
 * exceeds the model threshold. This is a runtime-level safety net called from
 * `loopAgentSteps` after `contextTokenCount` is computed.
 *
 * Orchestrators' `handleSteps` may still spawn the LLM-based context-pruner
 * agent for smarter summarization — this helper is a deterministic,
 * fast-acting fallback that trims via `trimMessagesToFitTokenLimit`.
 *
 * @param messages - The agent's message history (without step prompt)
 * @param systemTokens - Token count of system prompt + tools
 * @param contextTokenCount - Pre-computed total context tokens (messages + system + tools)
 * @param maxTotalTokens - Threshold; defaults to DEFAULT_MAX_CONTEXT_TOKENS
 * @param logger - Logger for telemetry inside trimMessagesToFitTokenLimit
 * @returns Pruned messages + a `pruned` flag indicating whether trimming occurred
 */
export function maybePruneContext(params: {
  messages: Message[]
  systemTokens: number
  contextTokenCount: number
  maxTotalTokens?: number
  logger: Logger
}): { messages: Message[]; pruned: boolean } {
  const {
    messages,
    systemTokens,
    contextTokenCount,
    maxTotalTokens = DEFAULT_MAX_CONTEXT_TOKENS,
    logger,
  } = params

  if (contextTokenCount <= maxTotalTokens) {
    return { messages, pruned: false }
  }

  const prunedMessages = trimMessagesToFitTokenLimit({
    messages,
    systemTokens,
    maxTotalTokens,
    logger,
  })

  return { messages: prunedMessages, pruned: true }
}
