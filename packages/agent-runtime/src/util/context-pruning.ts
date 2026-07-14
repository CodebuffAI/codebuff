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
 * The LLM-based context-pruner agent (`agents/context-pruner.ts`) uses the
 * model-aware semantic policy below. Its serialized `handleSteps` body mirrors
 * these constants inline and uses the conservative 140k trigger only when the
 * provider/model window is unknown.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 190_000

/**
 * Minimum tokens reserved for model output + non-message request overhead
 * (tool schemas, step prompt) when computing the effective message-token
 * budget from a model's context window. Mirrors the policy previously inlined
 * in `sdk/src/impl/llm.ts`; centralized here (M4.2) so the runtime fallback
 * and SDK request-time trim share one reserved-token policy.
 */
export const MODEL_CONTEXT_MIN_RESERVED_TOKENS = 8_000
export const MODEL_CONTEXT_MAX_RESERVED_TOKENS = 128_000
export const MODEL_CONTEXT_RESERVED_FRACTION = 0.12
export const MODEL_CONTEXT_MAX_RESERVED_FRACTION = 0.5

/**
 * Semantic compaction runs before the provider-safe emergency limit. The
 * trigger intentionally leaves materially more room than the mechanical
 * reserve for tool schemas, system prompts, output, and provider-side
 * accounting differences. The target is a history budget, not a hard final
 * request size: pinned control-plane memory and the fixed request baseline sit
 * outside it.
 *
 * Keep the mirrored constants inside `agents/context-pruner.ts` in sync. That
 * agent's `handleSteps` function is serialized and cannot import this module.
 */
export const SEMANTIC_COMPACTION_TRIGGER_FRACTION = 0.8
export const SEMANTIC_COMPACTION_TARGET_FRACTION = 0.42
export const SEMANTIC_COMPACTION_HEADROOM_FRACTION = 0.15
export const SEMANTIC_COMPACTION_MIN_HEADROOM_TOKENS = 32_000
export const SEMANTIC_COMPACTION_MAX_HEADROOM_TOKENS = 160_000
export const SEMANTIC_COMPACTION_MIN_TARGET_TOKENS = 72_000
export const SEMANTIC_COMPACTION_MAX_TARGET_TOKENS = 420_000
export const DEFAULT_SEMANTIC_COMPACTION_TRIGGER_TOKENS = 140_000
export const DEFAULT_SEMANTIC_COMPACTION_TARGET_TOKENS = 100_000

export type SemanticCompactionBudget = {
  resolvedContextWindowTokens?: number
  triggerBudgetTokens: number
  targetBudgetTokens: number
  headroomTokens?: number
}

function isUsableContextWindow(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Return deterministic, context-window-aware semantic compaction budgets.
 * Unknown or invalid provider windows use the conservative legacy fallback.
 */
export function getSemanticCompactionBudget(
  contextWindowTokens: number | undefined,
): SemanticCompactionBudget {
  if (!isUsableContextWindow(contextWindowTokens)) {
    return {
      triggerBudgetTokens: DEFAULT_SEMANTIC_COMPACTION_TRIGGER_TOKENS,
      targetBudgetTokens: DEFAULT_SEMANTIC_COMPACTION_TARGET_TOKENS,
    }
  }

  const headroomTokens = Math.min(
    SEMANTIC_COMPACTION_MAX_HEADROOM_TOKENS,
    Math.max(
      SEMANTIC_COMPACTION_MIN_HEADROOM_TOKENS,
      Math.floor(contextWindowTokens * SEMANTIC_COMPACTION_HEADROOM_FRACTION),
    ),
  )
  const triggerBudgetTokens = Math.max(
    1,
    Math.min(
      Math.floor(contextWindowTokens * SEMANTIC_COMPACTION_TRIGGER_FRACTION),
      contextWindowTokens - headroomTokens,
    ),
  )
  const scaledTargetTokens = Math.min(
    SEMANTIC_COMPACTION_MAX_TARGET_TOKENS,
    Math.max(
      SEMANTIC_COMPACTION_MIN_TARGET_TOKENS,
      Math.floor(contextWindowTokens * SEMANTIC_COMPACTION_TARGET_FRACTION),
    ),
  )

  return {
    resolvedContextWindowTokens: contextWindowTokens,
    triggerBudgetTokens,
    targetBudgetTokens: Math.max(
      1,
      Math.min(scaledTargetTokens, triggerBudgetTokens - 1),
    ),
    headroomTokens,
  }
}

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
    Math.max(
      1,
      Math.floor(contextWindowTokens * MODEL_CONTEXT_MAX_RESERVED_FRACTION),
    ),
    Math.min(
      MODEL_CONTEXT_MAX_RESERVED_TOKENS,
      Math.max(
        MODEL_CONTEXT_MIN_RESERVED_TOKENS,
        Math.floor(contextWindowTokens * MODEL_CONTEXT_RESERVED_FRACTION),
      ),
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
