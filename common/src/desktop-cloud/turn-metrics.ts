import { CREDIT_PRICING } from '../constants/limits'

import type {
  AgentUsageData,
  ContextCompactionData,
} from '../types/contracts/llm'

/**
 * A cloud run's token receipts, as a `freebuff_cloud_event` row of this kind.
 * Each row is the run's whole cumulative snapshot so far, never a delta: the
 * newest row of a run is its receipt, and a reader that missed earlier rows
 * loses nothing. Readers that predate the kind ignore it.
 */
export const CLOUD_METRICS_EVENT_KIND = 'metrics'

/**
 * The wire shape of the payload. It mirrors Desktop's `TurnMetrics`
 * (`freebuff-desktop/src/shared/turn-metrics.ts`), which forwards it whole, so
 * an optional field added on both sides needs no protocol change. Missing
 * fields are unknown, never zero.
 */
export type CloudTurnMetrics = {
  usage?: {
    inputTokens: number
    cachedInputTokens: number
    cachedInputTokensIncluded?: true
    outputTokens: number
    reasoningOutputTokens?: number
    totalTokens: number
  }
  usageIncomplete?: boolean
  costUsd?: number
  context?: {
    usedTokens: number
    windowTokens?: number
    compactionThresholdTokens?: number
  }
  compactions?: Array<{
    trigger: ContextCompactionData['trigger'] | 'auto'
    preTokens?: number
    postTokens?: number
    durationMs?: number
  }>
}

/** A history row's receipt, or null for any other row. Read by Desktop and Freebuff Web. */
export function readCloudTurnMetrics(
  kind: string,
  payload: unknown,
): CloudTurnMetrics | null {
  if (
    kind !== CLOUD_METRICS_EVENT_KIND ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  )
    return null
  return payload as CloudTurnMetrics
}

/**
 * Accumulates one run's receipts from the SDK's callbacks, the way Desktop's
 * local harness does: usage summed over every request, context from root
 * requests only. `take()` returns a snapshot only when something changed.
 *
 * `usedTokens` is the context the resumed state already carries. Without it
 * the context receipt waits for the first root request rather than reading 0.
 */
export function createCloudTurnMetrics(start: {
  windowTokens?: number
  compactionThresholdTokens?: number
  usedTokens?: number
}) {
  const limits: Omit<NonNullable<CloudTurnMetrics['context']>, 'usedTokens'> =
    {
      ...(start.windowTokens ? { windowTokens: start.windowTokens } : {}),
      ...(start.compactionThresholdTokens
        ? { compactionThresholdTokens: start.compactionThresholdTokens }
        : {}),
    }
  let metrics: CloudTurnMetrics = { compactions: [] }
  if (start.usedTokens !== undefined && start.usedTokens > 0)
    metrics.context = { ...limits, usedTokens: start.usedTokens }
  const contextWith = (usedTokens: number | undefined) =>
    usedTokens === undefined
      ? metrics.context
      : { ...metrics.context, ...limits, usedTokens }
  let allUsageIncludesReasoning = true
  let changed = false
  const update = (next: CloudTurnMetrics) => {
    metrics = next
    changed = true
  }
  return {
    usage(usage: AgentUsageData) {
      const previous = metrics.usage
      allUsageIncludesReasoning &&= usage.reasoningOutputTokens !== undefined
      update({
        ...metrics,
        usage: {
          inputTokens: (previous?.inputTokens ?? 0) + usage.inputTokens,
          cachedInputTokens:
            (previous?.cachedInputTokens ?? 0) + usage.cachedInputTokens,
          outputTokens: (previous?.outputTokens ?? 0) + usage.outputTokens,
          ...(allUsageIncludesReasoning
            ? {
                reasoningOutputTokens:
                  (previous?.reasoningOutputTokens ?? 0) +
                  (usage.reasoningOutputTokens ?? 0),
              }
            : {}),
          totalTokens: (previous?.totalTokens ?? 0) + usage.totalTokens,
        },
        ...(usage.isRoot ? { context: contextWith(usage.totalTokens) } : {}),
      })
    },
    usageIncomplete() {
      if (!metrics.usageIncomplete) update({ ...metrics, usageIncomplete: true })
    },
    compaction(receipt: ContextCompactionData) {
      limits.compactionThresholdTokens = receipt.thresholdTokens
      update({
        ...metrics,
        context: contextWith(receipt.postTokens ?? metrics.context?.usedTokens),
        compactions: [
          ...(metrics.compactions ?? []),
          {
            trigger: receipt.trigger,
            preTokens: receipt.preTokens,
            postTokens: receipt.postTokens,
            durationMs: receipt.durationMs,
          },
        ],
      })
    },
    /** The SDK `finish` event's `totalCost`, in credits. */
    finish(totalCost: unknown) {
      if (typeof totalCost !== 'number' || !Number.isFinite(totalCost)) return
      update({
        ...metrics,
        costUsd: (totalCost * CREDIT_PRICING.CENTS_PER_CREDIT) / 100,
      })
    },
    take(): CloudTurnMetrics | null {
      if (!changed) return null
      changed = false
      return metrics
    },
  }
}
