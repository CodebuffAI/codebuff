import { logger } from '../util/logger'
import { withRetry } from '../util/promise'
import db from './index'

type TransactionCallback<T> = Parameters<typeof db.transaction<T>>[0]

/**
 * Executes a database transaction with SERIALIZABLE isolation level and automatic
 * retries on serialization failures.
 * 
 * @param callback The transaction callback
 * @param context Additional context for logging (e.g., userId, operationId)
 * @returns The result of the transaction
 */
export async function withSerializableTransaction<T>(
  callback: TransactionCallback<T>,
  context: Record<string, any> = {}
): Promise<T> {
  return withRetry(
    async () => {
      return await db.transaction(
        callback,
        { isolationLevel: 'serializable' }
      )
    },
    {
      maxRetries: 3,
      retryIf: (error) => {
        // Retry on serialization failures (PostgreSQL error code 40001)
        if (error?.code === '40001') {
          logger.warn(
            { ...context, error },
            'Serialization failure in transaction, retrying...'
          )
          return true
        }
        return false
      },
      onRetry: (error, attempt) => {
        logger.warn(
          { ...context, attempt, error },
          `Transaction retry ${attempt}`
        )
      },
    }
  )
}