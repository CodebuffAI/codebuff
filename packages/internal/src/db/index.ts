import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@codebuff/internal/env'

import * as schema from './schema'

import type { CodebuffPgDatabase } from './types'

const client = postgres(env.DATABASE_URL)

export const db: CodebuffPgDatabase = drizzle(client, { schema })
export default db

// Re-export advisory lock utilities
export {
  ADVISORY_LOCK_IDS,
  tryAcquireAdvisoryLock,
  releaseAdvisoryLock,
} from './advisory-lock'
export type { AdvisoryLockId } from './advisory-lock'
