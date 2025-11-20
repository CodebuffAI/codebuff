/**
 * Retry Configuration Constants
 *
 * This module defines constants for retry behavior and exponential backoff.
 * Used by the CLI to automatically retry failed messages after reconnection.
 *
 * @example
 * ```typescript
 * import { MAX_RETRIES_PER_MESSAGE, RETRY_BACKOFF_BASE_DELAY_MS } from '@codebuff/sdk'
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
 * Duration in milliseconds to show the reconnection message
 * After this time, the message auto-hides
 */
export const RECONNECTION_MESSAGE_DURATION_MS = 2000

/**
 * Delay in milliseconds before retrying messages after reconnection
 * Gives the connection time to stabilize before attempting retries
 */
export const RECONNECTION_RETRY_DELAY_MS = 500
