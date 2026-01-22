import { INITIAL_RETRY_DELAY, withRetry } from '@codebuff/common/util/promise'
import { sql } from 'drizzle-orm'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import db from './index'

import type { Logger } from '@codebuff/common/types/contracts/logger'

type TransactionCallback<T> = Parameters<typeof db.transaction<T>>[0]

/**
 * PostgreSQL error codes that indicate transient failures worth retrying.
 * Organized by error class for clarity.
 *
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const RETRYABLE_PG_ERROR_CODES: Record<string, string> = {
  // Class 40 — Transaction Rollback (serialization/concurrency conflicts)
  '40001': 'serialization_failure',
  '40003': 'statement_completion_unknown',
  '40P01': 'deadlock_detected',

  // Class 08 — Connection Exception
  '08000': 'connection_exception',
  '08001': 'sqlclient_unable_to_establish_sqlconnection',
  '08003': 'connection_does_not_exist',
  '08004': 'sqlserver_rejected_establishment_of_sqlconnection',
  '08006': 'connection_failure',
  '08P01': 'protocol_violation',

  // Class 57 — Operator Intervention
  '57014': 'query_canceled', // Often indicates statement timeout
  '57P01': 'admin_shutdown',
  '57P02': 'crash_shutdown',
  '57P03': 'cannot_connect_now',

  // Class 53 — Insufficient Resources
  '53000': 'insufficient_resources',
  '53100': 'disk_full',
  '53200': 'out_of_memory',
  '53300': 'too_many_connections',
}

/**
 * Maximum depth to traverse when searching for PostgreSQL error codes in nested cause chains.
 * This limit prevents excessive iteration in pathological cases where the seen set check
 * might not catch very long non-circular chains. In practice, Drizzle/pg errors typically
 * nest 2-3 levels deep, so 6 provides ample headroom while ensuring bounded execution.
 */
const MAX_ERROR_CAUSE_DEPTH = 6

/**
 * Regular expression to validate PostgreSQL error codes.
 * PostgreSQL error codes are exactly 5 characters consisting of digits (0-9) and
 * uppercase letters (A-Z). Examples: 40001, 40P01, 08006, 23505
 *
 * This validation ensures we don't mistakenly return non-PG error codes like
 * 'ECONNRESET', 'TIMEOUT', or 'FETCH_ERROR' that may appear in wrapper errors.
 */
const PG_ERROR_CODE_REGEX = /^[0-9A-Z]{5}$/i

/** Threshold for logging significant lock wait times (3 seconds) */
const SIGNIFICANT_LOCK_WAIT_MS = 3000

/** Threshold for logging significant retry delays (3 seconds cumulative) */
const SIGNIFICANT_RETRY_DELAY_MS = 3000

/**
 * Extracts a user ID for analytics tracking from context or lock key.
 * Falls back to 'system' if no user ID can be determined.
 */
function getUserIdForAnalytics(
  context: Record<string, unknown>,
  lockKey?: string,
): string {
  // Try to get userId from context
  if (typeof context.userId === 'string' && context.userId) {
    return context.userId
  }
  // Try to get organizationId from context
  if (typeof context.organizationId === 'string' && context.organizationId) {
    return context.organizationId
  }
  // Try to extract from lockKey (format: "user:id" or "org:id")
  if (lockKey) {
    const colonIndex = lockKey.indexOf(':')
    if (colonIndex > 0 && colonIndex < lockKey.length - 1) {
      return lockKey.substring(colonIndex + 1)
    }
  }
  return 'system'
}

function getPostgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  let current: unknown = error
  const seen = new Set<object>()
  let depth = 0

  while (current && typeof current === 'object' && depth < MAX_ERROR_CAUSE_DEPTH) {
    if (seen.has(current)) {
      return null // Circular reference detected
    }
    seen.add(current)

    const record = current as Record<string, unknown>
    if (typeof record.code === 'string' && PG_ERROR_CODE_REGEX.test(record.code)) {
      return record.code
    }

    current = record.cause
    depth += 1
  }

  return null
}

/**
 * Checks if an error is a retryable PostgreSQL error.
 * Returns the error description if retryable, null otherwise.
 */
export function getRetryableErrorDescription(
  error: unknown,
): string | null {
  const errorCode = getPostgresErrorCode(error)
  if (typeof errorCode !== 'string') {
    return null
  }

  // Check exact match first
  if (errorCode in RETRYABLE_PG_ERROR_CODES) {
    return RETRYABLE_PG_ERROR_CODES[errorCode]
  }

  // Check class-level match (first 2 characters) for retryable error classes
  // This catches any errors in these classes we may not have explicitly listed
  const errorClass = errorCode.substring(0, 2)
  const retryableClasses: Record<string, string> = {
    '08': 'connection_exception',
    '40': 'transaction_rollback',
    '53': 'insufficient_resources',
    '57': 'operator_intervention',
  }
  if (errorClass in retryableClasses) {
    return `${retryableClasses[errorClass]}_${errorCode}`
  }

  return null
}

/**
 * Checks if an error is a retryable PostgreSQL error.
 */
export function isRetryablePostgresError(error: unknown): boolean {
  return getRetryableErrorDescription(error) !== null
}

/**
 * Executes a database transaction with SERIALIZABLE isolation level and automatic
 * retries on transient failures.
 *
 * Retries on:
 * - Serialization failures (40001) and deadlocks (40P01)
 * - Connection exceptions (08xxx class)
 * - Operator intervention (57xxx: timeouts, shutdowns)
 * - Insufficient resources (53xxx: too many connections, out of memory)
 *
 * @param callback The transaction callback
 * @param context Additional context for logging (e.g., userId, operationId)
 * @returns The result of the transaction
 */
export async function withSerializableTransaction<T>({
  callback,
  context = {},
  logger,
}: {
  callback: TransactionCallback<T>
  context: Record<string, unknown>
  logger: Logger
}): Promise<T> {
  return withRetry(
    async () => {
      return await db.transaction(callback, { isolationLevel: 'serializable' })
    },
    {
      maxRetries: 5, // Allow more retries for connection errors to recover
      retryDelayMs: INITIAL_RETRY_DELAY, // 1s, 2s, 4s, 8s, 16s exponential backoff
      retryIf: (error) => {
        // Only determine if error is retryable; logging happens in onRetry
        return getRetryableErrorDescription(error) !== null
      },
      onRetry: (error, attempt) => {
        const errorCode = getPostgresErrorCode(error) ?? 'unknown'
        const errorDescription =
          getRetryableErrorDescription(error) ?? 'unknown'
        // Calculate cumulative retry delay: 1s + 2s + 4s + ... (geometric series)
        const cumulativeDelayMs = INITIAL_RETRY_DELAY * (Math.pow(2, attempt) - 1)

        // Only log at WARN level after significant cumulative delay to avoid excessive logging
        // First few quick retries are expected behavior; extended retries indicate real issues
        if (cumulativeDelayMs >= SIGNIFICANT_RETRY_DELAY_MS) {
          logger.warn(
            {
              ...context,
              attempt,
              pgErrorCode: errorCode,
              pgErrorDescription: errorDescription,
              cumulativeDelayMs,
            },
            `Serializable transaction retry ${attempt}: ${errorDescription} (${errorCode}), cumulative delay ${(cumulativeDelayMs / 1000).toFixed(1)}s`,
          )

          // Track in PostHog for analytics
          trackEvent({
            event: AnalyticsEvent.TRANSACTION_RETRY_THRESHOLD_EXCEEDED,
            userId: getUserIdForAnalytics(context),
            properties: {
              ...context,
              transactionType: 'serializable',
              attempt,
              pgErrorCode: errorCode,
              pgErrorDescription: errorDescription,
              cumulativeDelayMs,
            },
            logger,
          })
        }
      },
    },
  )
}

/** Default timeout for advisory lock acquisition (30 seconds) */
const ADVISORY_LOCK_TIMEOUT_MS = 30000

/** Result of withAdvisoryLockTransaction including timing metadata */
export interface AdvisoryLockTransactionResult<T> {
  result: T
  lockWaitMs: number
}

/**
 * Executes a database transaction with a PostgreSQL advisory lock for serialization.
 *
 * This function provides an alternative to SERIALIZABLE isolation that:
 * - Uses a per-key advisory lock to serialize operations on the same entity (user/org)
 * - Allows different entities to process in parallel without conflict
 * - Eliminates serialization failures (40001) by making concurrent transactions wait
 * - Uses READ COMMITTED isolation which is sufficient when advisory lock is held
 *
 * The advisory lock is automatically released when the transaction commits or rolls back.
 *
 * Lock key should be prefixed to avoid collisions between different entity types:
 * - User operations: `user:${userId}`
 * - Organization operations: `org:${organizationId}`
 *
 * @param callback The transaction callback
 * @param lockKey A string key (e.g., "user:uuid" or "org:uuid") to use for the advisory lock
 * @param context Additional context for logging
 * @param lockTimeoutMs Optional timeout for lock acquisition (default: 30s)
 * @returns Object containing the transaction result and lock wait time in milliseconds
 */
export async function withAdvisoryLockTransaction<T>({
  callback,
  lockKey,
  context = {},
  logger,
  lockTimeoutMs = ADVISORY_LOCK_TIMEOUT_MS,
}: {
  callback: TransactionCallback<T>
  lockKey: string
  context: Record<string, unknown>
  logger: Logger
  lockTimeoutMs?: number
}): Promise<AdvisoryLockTransactionResult<T>> {
  // Validate lock key to prevent bugs from null/empty keys
  if (!lockKey || typeof lockKey !== 'string' || lockKey.trim() === '') {
    throw new Error('lockKey must be a non-empty string')
  }

  return await withRetry(
    async () => {
      return await db.transaction(
        async (tx) => {
          // Set a statement timeout to prevent indefinite blocking if a lock holder hangs.
          // This timeout applies to the lock acquisition and subsequent statements.
          await tx.execute(
            sql`SET LOCAL statement_timeout = ${sql.raw(lockTimeoutMs.toString())}`,
          )

          // Acquire advisory lock - blocks until lock is available (or timeout).
          // We use MD5 to generate a 60-bit hash, dramatically reducing collision probability
          // compared to hashtext() which only produces 32 bits.
          // left(md5(key), 15) gives 15 hex chars (60 bits), which fits in a signed 64-bit bigint.
          const lockStart = Date.now()
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(('x' || left(md5(${lockKey}), 15))::bit(60)::bigint)`,
          )
          const lockWaitMs = Date.now() - lockStart

          // Log at WARN level only for significant waits (3+ seconds) to avoid excessive logging
          if (lockWaitMs > SIGNIFICANT_LOCK_WAIT_MS) {
            logger.warn(
              { ...context, lockKey, lockWaitMs },
              `Advisory lock contention: waited ${(lockWaitMs / 1000).toFixed(1)}s for lock`,
            )

            // Track in PostHog for analytics
            trackEvent({
              event: AnalyticsEvent.ADVISORY_LOCK_CONTENTION,
              userId: getUserIdForAnalytics(context, lockKey),
              properties: {
                ...context,
                lockKey,
                lockKeyType: lockKey.split(':')[0],
                lockWaitMs,
                lockWaitSeconds: lockWaitMs / 1000,
              },
              logger,
            })
          }

          const result = await callback(tx)
          return { result, lockWaitMs }
        },
        { isolationLevel: 'read committed' },
      )
    },
    {
      maxRetries: 5,
      retryDelayMs: INITIAL_RETRY_DELAY,
      retryIf: (error) => {
        const description = getRetryableErrorDescription(error)
        // Don't retry serialization failures with advisory locks - they shouldn't happen
        // and if they do, something is wrong with the lock
        if (description === 'serialization_failure') {
          return false
        }
        return description !== null
      },
      onRetry: (error, attempt) => {
        const errorCode = getPostgresErrorCode(error) ?? 'unknown'
        const errorDescription =
          getRetryableErrorDescription(error) ?? 'unknown'
        const baseDelayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1)
        // Calculate cumulative retry delay: 1s + 2s + 4s + ... (geometric series)
        const cumulativeDelayMs = INITIAL_RETRY_DELAY * (Math.pow(2, attempt) - 1)

        // Only log at WARN level after significant cumulative delay to avoid excessive logging
        // First few quick retries are expected behavior; extended retries indicate real issues
        if (cumulativeDelayMs >= SIGNIFICANT_RETRY_DELAY_MS) {
          logger.warn(
            {
              ...context,
              lockKey,
              attempt,
              pgErrorCode: errorCode,
              pgErrorDescription: errorDescription,
              cumulativeDelayMs,
            },
            `Advisory lock transaction retry ${attempt}: ${errorDescription} (${errorCode}), cumulative delay ${(cumulativeDelayMs / 1000).toFixed(1)}s`,
          )

          // Track in PostHog for analytics
          trackEvent({
            event: AnalyticsEvent.TRANSACTION_RETRY_THRESHOLD_EXCEEDED,
            userId: getUserIdForAnalytics(context, lockKey),
            properties: {
              ...context,
              transactionType: 'advisory_lock',
              lockKey,
              lockKeyType: lockKey.split(':')[0],
              attempt,
              pgErrorCode: errorCode,
              pgErrorDescription: errorDescription,
              cumulativeDelayMs,
            },
            logger,
          })
        }
      },
    },
  )
}
