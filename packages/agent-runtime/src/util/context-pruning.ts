import { trimMessagesToFitTokenLimitWithReport } from './messages'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ContextTrimReport } from './messages'

/**
 * Default maximum context tokens before auto-pruning triggers. Matches the
 * default in `trimMessagesToFitTokenLimit` (190k), which is a safe threshold
 * for most models' context windows.
 *
 * This is the single source of truth for the unified pruning threshold (M4,
 * SPEC R4). It is imported by:
 * - `packages/agent-runtime/src/run-agent-step.ts` (runtime fallback via
 *   `maybePruneContext` and the context-window status emission)
 * - `sdk/src/impl/llm.ts` (request-time emergency-brake fallback limit)
 *
 * The LLM-based context-pruner agent (`agents/context-pruner.ts`) uses a
 * lower inline default (`DEFAULT_MAX_CONTEXT_LENGTH = 140_000`) because its
 * `handleSteps` body is serialized to a string and cannot import this module;
 * that value is intentionally more aggressive since it performs semantic
 * summarization rather than mechanical trimming.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 190_000

/**
 * Minimum tokens reserved for model output + non-message request overhead
 * (tool schemas, step prompt) when computing the effective message-token
 * budget from a model's context window. Mirrors the policy previously inlined
 * in `sdk/src/impl/llm.ts`; centralized here (M4.2) so the runtime fallback
 * and SDK request-time trim share one reserved-token policy.
 */
export const MODEL_CONTEXT_MIN_RESERVED_TOKENS = 1_024
export const MODEL_CONTEXT_MAX_RESERVED_TOKENS = 16_000
export const MODEL_CONTEXT_RESERVED_FRACTION = 0.1

/**
 * Compute the number of tokens to reserve (output + overhead) for a given
 * model context window. Clamped to [MIN, MAX] and floored to a fraction of
 * the window. Returns `undefined` when `contextWindowTokens` is undefined
 * (unknown model window) so callers can fall back to the flat
 * `DEFAULT_MAX_CONTEXT_TOKENS` default.
 */
export function getModelContextReservedTokens(
  contextWindowTokens: number | undefined,
): number | undefined {
  if (contextWindowTokens === undefined) {
    return undefined
  }
  return Math.min(
    MODEL_CONTEXT_MAX_RESERVED_TOKENS,
    Math.max(
      MODEL_CONTEXT_MIN_RESERVED_TOKENS,
      Math.floor(contextWindowTokens * MODEL_CONTEXT_RESERVED_FRACTION),
    ),
  )
}

/**
 * Compute the effective message-token limit for a given model context window,
 * subtracting the reserved overhead. Returns `DEFAULT_MAX_CONTEXT_TOKENS`
 * (the unified flat threshold) when the model window is unknown, so the SDK
 * request-time trim and runtime fallback converge on the same limit.
 */
export function getModelContextMessageLimit(
  contextWindowTokens: number | undefined,
): number {
  if (contextWindowTokens === undefined) {
    return DEFAULT_MAX_CONTEXT_TOKENS
  }
  // The non-null assertion is safe: we already returned when
  // contextWindowTokens was undefined, and getModelContextReservedTokens
  // only returns undefined when its input is undefined. TS cannot infer
  // this correlation through the `number | undefined` return type, so the
  // assertion keeps a single computation site (no duplicated formula).
  const reserved = getModelContextReservedTokens(contextWindowTokens)!
  return Math.max(1, contextWindowTokens - reserved)
}

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
}): { messages: Message[]; pruned: boolean; report?: ContextTrimReport } {
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

  const report = trimMessagesToFitTokenLimitWithReport({
    messages,
    systemTokens,
    maxTotalTokens,
    logger,
  })

  return { messages: report.messages, pruned: true, report }
}
