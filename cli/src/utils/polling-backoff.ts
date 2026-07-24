export type RandomSource = () => number

const FAILURE_BACKOFF_BASE_MS = 20_000
const FAILURE_BACKOFF_MAX_MS = 300_000

function unitInterval(random: RandomSource): number {
  return Math.max(0, Math.min(1, random()))
}

/**
 * Exponential retry delay with equal jitter. Keeping the lower half of the
 * exponential window avoids immediate retry loops while still spreading a
 * large disconnected fleet across time.
 */
export function failedPollDelayMs({
  consecutiveFailures,
  retryAfterMs,
  random = Math.random,
}: {
  consecutiveFailures: number
  retryAfterMs?: number
  random?: RandomSource
}): number {
  const exponent = Math.max(0, consecutiveFailures - 1)
  const cap = Math.min(
    FAILURE_BACKOFF_MAX_MS,
    FAILURE_BACKOFF_BASE_MS * 2 ** exponent,
  )
  const half = cap / 2
  const backoffMs = Math.max(1, Math.round(half + half * unitInterval(random)))
  if (retryAfterMs === undefined) return backoffMs

  const boundedRetryAfterMs = Number.isFinite(retryAfterMs)
    ? Math.max(0, Math.min(FAILURE_BACKOFF_MAX_MS, retryAfterMs))
    : 0
  const jitteredRetryAfterMs = Math.max(
    1,
    Math.round(boundedRetryAfterMs * (1 + 0.2 * unitInterval(random))),
  )
  return Math.min(
    FAILURE_BACKOFF_MAX_MS,
    Math.max(backoffMs, jitteredRetryAfterMs),
  )
}

/** Add symmetric jitter to a successful polling cadence. */
export function jitterPollIntervalMs({
  intervalMs,
  jitterRatio = 0.2,
  random = Math.random,
}: {
  intervalMs: number
  jitterRatio?: number
  random?: RandomSource
}): number {
  const ratio = Math.max(0, Math.min(1, jitterRatio))
  const multiplier = 1 - ratio + 2 * ratio * unitInterval(random)
  return Math.max(1, Math.round(intervalMs * multiplier))
}
