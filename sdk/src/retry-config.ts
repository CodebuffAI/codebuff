/**
 * Centralized retry and connection configuration
 *
 * This file contains all constants related to retry logic, backoff strategies,
 * and connection management across the SDK and CLI.
 */

/**
 * Maximum number of retry attempts per message before giving up
 * After this many failures, the message will be marked as failed
 */
export const MAX_RETRIES_PER_MESSAGE = 3

/**
 * Base delay for exponential backoff retry strategy (in milliseconds)
 * First retry starts at this delay, then doubles with each subsequent retry
 *
 * Example progression: 1s → 2s → 4s → 8s (capped at max)
 */
export const RETRY_BACKOFF_BASE_DELAY_MS = 1_000

/**
 * Maximum delay for exponential backoff retry strategy (in milliseconds)
 * Prevents backoff from growing unbounded during extended outages
 */
export const RETRY_BACKOFF_MAX_DELAY_MS = 8_000

/**
 * Delay before attempting to retry pending messages after reconnection (in milliseconds)
 * Short delay allows connection to stabilize before retrying
 */
export const RECONNECTION_RETRY_DELAY_MS = 500

/**
 * Duration to show the reconnection success message (in milliseconds)
 * Message is automatically hidden after this duration
 */
export const RECONNECTION_MESSAGE_DURATION_MS = 2_000

/**
 * Calculates the next backoff delay using exponential backoff strategy
 *
 * @param currentDelay - Current delay in milliseconds
 * @param hasMorePending - Whether there are more pending operations
 * @returns Next delay in milliseconds, capped at RETRY_BACKOFF_MAX_DELAY_MS
 *
 * @example
 * ```typescript
 * let delay = RETRY_BACKOFF_BASE_DELAY_MS
 * delay = calculateBackoffDelay(delay, true)  // 2000ms
 * delay = calculateBackoffDelay(delay, true)  // 4000ms
 * delay = calculateBackoffDelay(delay, false) // 1000ms (reset)
 * ```
 */
export function calculateBackoffDelay(
  currentDelay: number,
  hasMorePending: boolean,
): number {
  if (!hasMorePending) {
    return RETRY_BACKOFF_BASE_DELAY_MS
  }
  return Math.min(currentDelay * 2, RETRY_BACKOFF_MAX_DELAY_MS)
}

/**
 * Type representing retry configuration that can be customized
 */
export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  reconnectionDelay: number
}

/**
 * Default retry configuration
 * Can be used to create custom configurations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: MAX_RETRIES_PER_MESSAGE,
  baseDelay: RETRY_BACKOFF_BASE_DELAY_MS,
  maxDelay: RETRY_BACKOFF_MAX_DELAY_MS,
  reconnectionDelay: RECONNECTION_RETRY_DELAY_MS,
}
