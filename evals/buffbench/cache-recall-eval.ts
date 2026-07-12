import type { CacheRecallEvalConfig, CacheRecallEvalResult } from './types'

export type CacheUsageMetrics = {
  cachedInputTokens: number
  inputTokens: number
  cacheHitRatio?: number
}

export function computeCacheUsageMetrics(params: {
  cachedInputTokens: number
  inputTokens: number
}): CacheUsageMetrics {
  const { cachedInputTokens, inputTokens } = params
  return {
    cachedInputTokens,
    inputTokens,
    cacheHitRatio:
      inputTokens > 0 ? cachedInputTokens / inputTokens : undefined,
  }
}

export function evaluateCacheRecall(params: {
  config: CacheRecallEvalConfig
  cacheUsage?: CacheUsageMetrics
  finalMessageHistoryText?: string
}): CacheRecallEvalResult {
  const { config, cacheUsage, finalMessageHistoryText = '' } = params
  const requiredRecallSubstrings = config.requiredRecallSubstrings ?? []
  const recallEvaluated = requiredRecallSubstrings.length > 0
  const missingRecallSubstrings = requiredRecallSubstrings.filter(
    (substring) => !finalMessageHistoryText.includes(substring),
  )

  const observedCacheHitRatio = cacheUsage?.cacheHitRatio
  const cacheHitRatioPassed =
    config.minCacheHitRatio === undefined ||
    (observedCacheHitRatio !== undefined &&
      observedCacheHitRatio >= config.minCacheHitRatio)
  const recallPassed = recallEvaluated && missingRecallSubstrings.length === 0
  const recallAssertionsConfigured =
    !config.requireRecallAssertions || recallEvaluated
  const passed =
    cacheHitRatioPassed &&
    recallAssertionsConfigured &&
    (!recallEvaluated || recallPassed)

  const failureReasons: string[] = []
  if (!cacheHitRatioPassed) {
    const observed =
      observedCacheHitRatio === undefined
        ? 'unavailable'
        : observedCacheHitRatio.toFixed(3)
    failureReasons.push(
      `cache hit ratio ${observed} below required ${config.minCacheHitRatio}`,
    )
  }
  if (!recallPassed) {
    if (!recallEvaluated && config.requireRecallAssertions) {
      failureReasons.push('recall assertions are required but none were configured')
    }
  }
  if (recallEvaluated && !recallPassed) {
    failureReasons.push(
      `missing recall substrings: ${missingRecallSubstrings.join(', ')}`,
    )
  }

  return {
    passed,
    cachedInputTokens: cacheUsage?.cachedInputTokens ?? 0,
    inputTokens: cacheUsage?.inputTokens ?? 0,
    cacheHitRatio: observedCacheHitRatio,
    minCacheHitRatio: config.minCacheHitRatio,
    cacheHitRatioPassed,
    requiredRecallSubstrings,
    missingRecallSubstrings,
    recallEvaluated,
    recallPassed,
    failureReason:
      failureReasons.length > 0 ? failureReasons.join('; ') : undefined,
  }
}
