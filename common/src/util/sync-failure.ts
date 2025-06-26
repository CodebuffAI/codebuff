import { sql } from 'drizzle-orm'

import db from '../db'
import { logger } from './logger'
import * as schema from '../db/schema'

export async function logSyncFailure(
  id: string,
  errorMessage: string,
  provider = 'stripe'
): Promise<void> {
  try {
    await db
      .insert(schema.syncFailure)
      .values({
        id,
        provider,
        last_error: errorMessage,
        last_attempt_at: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.syncFailure.id,
        set: {
          last_error: errorMessage,
          last_attempt_at: new Date(),
          retry_count: sql`${schema.syncFailure.retry_count} + 1`,
        },
      })
  } catch (dbError) {
    logger.error(
      { id, provider, error: dbError },
      'Failed to log sync failure to database.'
    )
  }
}
