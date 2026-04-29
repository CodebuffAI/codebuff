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

/** Per-account override on top of the global kill switch. The internal
 *  `team@codebuff.com` account drives e2e tests in CI; landing it in the
 *  queue would make those tests flake whenever the waiting room is warm.
 *  Bypassed users behave exactly as if the waiting room were disabled. */
const WAITING_ROOM_BYPASS_EMAILS = new Set<string>(['team@codebuff.com'])
export function isWaitingRoomBypassedForEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false
  return WAITING_ROOM_BYPASS_EMAILS.has(email.toLowerCase())
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

/**
 * Per-model instant-admit capacity: how many concurrent active sessions a
 * deployment can hold before new joiners fall back to the FIFO queue + tick.
 * Deployment-sizing knob — kept server-side so we can tune without bumping
 * the shared `common` package that the CLI consumes. Unknown ids → 0 (always
 * queue).
 */
const INSTANT_ADMIT_CAPACITY: Record<string, number> = {
  'moonshotai/kimi-k2.6': 50,
  'minimax/minimax-m2.7': 1000,
}

export function getInstantAdmitCapacity(id: string): number {
  return INSTANT_ADMIT_CAPACITY[id] ?? 0
}
