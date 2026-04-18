import { env } from '@codebuff/internal/env'

/**
 * Advisory lock ID claimed by the admission tick so only one pod admits
 * users at a time. Unique magic number — keep in sync with
 * packages/internal/src/db/advisory-lock.ts if centralising later.
 */
export const FREEBUFF_ADMISSION_LOCK_ID = 573924815

/** Admission tick cadence. Fast enough to drain the queue promptly, slow
 *  enough to avoid DB churn. */
export const ADMISSION_TICK_MS = 5_000

/** Max users admitted in a single tick. Protects against thundering-herd
 *  admissions when capacity frees up all at once (e.g. after a Fireworks
 *  incident clears). */
export const MAX_ADMITS_PER_TICK = 20

export function isWaitingRoomEnabled(): boolean {
  return env.FREEBUFF_WAITING_ROOM_ENABLED
}

export function getSessionLengthMs(): number {
  return env.FREEBUFF_SESSION_LENGTH_MS
}

export function getMaxConcurrentSessions(): number {
  return env.FREEBUFF_MAX_CONCURRENT_SESSIONS
}
