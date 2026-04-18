import { env } from '@codebuff/internal/env'

/**
 * Advisory lock ID claimed by the admission tick so only one pod admits
 * users at a time. Unique magic number — keep in sync with
 * packages/internal/src/db/advisory-lock.ts if centralising later.
 */
export const FREEBUFF_ADMISSION_LOCK_ID = 573924815

/** Admission tick cadence. Paired with MAX_ADMITS_PER_TICK=1 this staggers
 *  admissions so newly-admitted CLIs don't all POST to the
 *  Fireworks deployment simultaneously. */
export const ADMISSION_TICK_MS = 15_000

/** Max users admitted in a single tick. Staggering matters more than
 *  throughput here: keeps load on Fireworks smooth even when a
 *  large block of sessions expires at once. */
export const MAX_ADMITS_PER_TICK = 1

export function isWaitingRoomEnabled(): boolean {
  return env.FREEBUFF_WAITING_ROOM_ENABLED
}

export function getSessionLengthMs(): number {
  return env.FREEBUFF_SESSION_LENGTH_MS
}
