import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@codebuff/internal/env'

import * as schema from './schema'
import {
  DB_CONNECT_TIMEOUT_SECONDS,
  DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS,
  DB_LOCK_TIMEOUT_MS,
} from './timeouts'

import type { CodebuffPgDatabase } from './types'

// Pooled client shared by app services (web) and repo scripts — both resolve
// DATABASE_URL. Hardened 2026-07-03 after a prod incident: an instance killed
// mid-transaction (deploy restart) held a free_session row lock for ~979s (the
// TCP keepalive dead-peer window, tcp_keepalives_idle=300), and the blocked
// statements silently starved the instance's whole pool.
//
// - max: prod max_connections=403; ~7 web instances × 20 = 140 worst case,
//   leaving headroom for scripts and other consumers.
// - The timeout GUCs kill dead lock holders (idle_in_transaction) and stop
//   waiters from blocking pool slots (lock_timeout); how they interlock with
//   the retry/override logic in ./transaction.ts is documented in ./timeouts.ts.
//   All our transaction callbacks are pure DB work (no external I/O inside a
//   tx), so 60s idle-in-transaction is far above any legitimate idle gap.
// - Deliberately NO statement_timeout here: long analytics/backfill scripts in
//   scripts/ use this same client and must not be capped. Advisory-lock
//   transactions already bound themselves with a SET LOCAL statement_timeout.
const client = postgres(env.DATABASE_URL, {
  max: 20,
  // Seconds (postgres-js option) — fail fast when the DB is unreachable.
  connect_timeout: DB_CONNECT_TIMEOUT_SECONDS,
  // Per-connection server GUCs, in milliseconds (their native unit).
  connection: {
    idle_in_transaction_session_timeout:
      DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS,
    lock_timeout: DB_LOCK_TIMEOUT_MS,
  },
})

export const db: CodebuffPgDatabase = drizzle(client, { schema })
export default db

// Re-export advisory lock utilities
export {
  ADVISORY_LOCK_IDS,
  coerceBool,
  tryAcquireAdvisoryLock,
} from './advisory-lock'
export type { LockHandle, AdvisoryLockId } from './advisory-lock'
