import { INITIAL_RETRY_DELAY, withRetry } from '@codebuff/common/util/promise'

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
 * Checks if an error is a retryable PostgreSQL error.
 * Returns the error description if retryable, null otherwise.
 */
export function getRetryableErrorDescription(
  error: unknown,
): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const errorCode = (error as Record<string, unknown>).code
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
        const errorCode = (error as Record<string, unknown>)?.code ?? 'unknown'
        const errorDescription = getRetryableErrorDescription(error) ?? 'unknown'
        // Base delay before jitter is applied (actual delay will be ±20%)
        const baseDelayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.warn(
          {
            ...context,
            attempt,
            pgErrorCode: errorCode,
            pgErrorDescription: errorDescription,
            baseDelayMs,
            error,
          },
          `Transaction retry ${attempt}: ${errorDescription} (${errorCode}), waiting ~${baseDelayMs}ms`,
        )
      },
    },
  )
}
