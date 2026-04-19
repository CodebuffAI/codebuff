import { env } from '@codebuff/internal/env'

/**
 * Advisory lock ID claimed by the admission tick so only one pod admits
 * users at a time. Unique magic number — keep in sync with
 * packages/internal/src/db/advisory-lock.ts if centralising later.
 */
export const FREEBUFF_ADMISSION_LOCK_ID = 573924815

/** Admission tick cadence. Each tick admits at most one user, so this is the
 *  drip rate: staggering admissions keeps newly-admitted CLIs from all hitting
 *  Fireworks simultaneously even when a large block of sessions expires at once. */
export const ADMISSION_TICK_MS = 15_000

export function isWaitingRoomEnabled(): boolean {
  return env.FREEBUFF_WAITING_ROOM_ENABLED
}

export function getSessionLengthMs(): number {
  return env.FREEBUFF_SESSION_LENGTH_MS
}

/** Drain window after a session's `expires_at`. During this window the gate
 *  still admits requests so an in-flight agent run can finish, but the CLI is
 *  expected to stop accepting new user prompts. Hard cutoff at
 *  `expires_at + grace`; past that the gate returns `session_expired`. */
export function getSessionGraceMs(): number {
  return env.FREEBUFF_SESSION_GRACE_MS
}
