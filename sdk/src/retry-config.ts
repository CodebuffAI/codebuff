/**
 * Retry Configuration Constants
 *
 * This module defines constants for retry behavior and exponential backoff.
 * Used by the CLI to automatically retry failed messages after reconnection.
 *
 * @example
 * ```typescript
 * import { MAX_RETRIES_PER_MESSAGE, RETRY_BACKOFF_BASE_DELAY_MS } from '@openbuff/sdk'
 *
 * let retryCount = 0
 * let backoffDelay = RETRY_BACKOFF_BASE_DELAY_MS
 *
 * while (retryCount < MAX_RETRIES_PER_MESSAGE) {
 *   await new Promise(resolve => setTimeout(resolve, backoffDelay))
 *   // ... retry logic
 *   backoffDelay = Math.min(backoffDelay * 2, RETRY_BACKOFF_MAX_DELAY_MS)
 *   retryCount++
 * }
 * ```
 */

/**
 * Maximum number of retry attempts per message
 * After this many attempts, the message is marked as permanently failed
 */
export const MAX_RETRIES_PER_MESSAGE = 3

/**
 * Base delay in milliseconds for exponential backoff
 * First retry: 1s, Second: 2s, Third: 4s, Fourth: 8s (capped)
 */
export const RETRY_BACKOFF_BASE_DELAY_MS = 1000

/**
 * Maximum delay in milliseconds for exponential backoff
 * Prevents backoff from growing indefinitely
 */
export const RETRY_BACKOFF_MAX_DELAY_MS = 8000

/**
 * Jitter multiplier range applied to backoff delays (±20%).
 *
 * Each computed delay is multiplied by a random factor in
 * `[1 - JITTER_FRACTION, 1 + JITTER_FRACTION]` to prevent thundering-herd
 * retries when many clients retry simultaneously after a transient outage.
 * Matches the jitter strategy in `common/src/util/promise.ts`.
 */
export const RETRY_BACKOFF_JITTER_FRACTION = 0.2

/**
 * Compute the delay in milliseconds for retry attempt `attempt` (0-based)
 * using exponential backoff capped at `RETRY_BACKOFF_MAX_DELAY_MS`, with
 * optional jitter (±`RETRY_BACKOFF_JITTER_FRACTION`).
 *
 * @param attempt - 0-based attempt index (0 = first retry, 1 = second, ...)
 * @param baseDelayMs - base delay for the first attempt; defaults to
 *   `RETRY_BACKOFF_BASE_DELAY_MS`.
 * @param jitter - when true (default), apply ±20% jitter to the computed
 *   delay. Pass `false` only for tests that need deterministic timing.
 * @returns the delay in milliseconds (rounded to the nearest integer, clamped
 *   to `RETRY_BACKOFF_MAX_DELAY_MS`).
 */
export function computeBackoffDelayMs(params: {
  attempt: number
  baseDelayMs?: number
  jitter?: boolean
}): number {
  const { attempt, baseDelayMs = RETRY_BACKOFF_BASE_DELAY_MS, jitter = true } = params

  const exponent = attempt < 0 ? 0 : attempt
  const base = Math.min(
    baseDelayMs * Math.pow(2, exponent),
    RETRY_BACKOFF_MAX_DELAY_MS,
  )

  if (!jitter) {
    return Math.round(base)
  }

  const lo = 1 - RETRY_BACKOFF_JITTER_FRACTION
  const span = 2 * RETRY_BACKOFF_JITTER_FRACTION
  const multiplier = lo + Math.random() * span
  const jittered = Math.min(base * multiplier, RETRY_BACKOFF_MAX_DELAY_MS)
  return Math.round(jittered)
}

/**
 * Duration in milliseconds to show the reconnection message
 * After this time, the message auto-hides
 */
export const RECONNECTION_MESSAGE_DURATION_MS = 2000

/**
 * Delay in milliseconds before retrying messages after reconnection
 * Gives the connection time to stabilize before attempting retries
 */
export const RECONNECTION_RETRY_DELAY_MS = 500
