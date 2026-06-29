import { env } from '@codebuff/internal/env'

/** Throttle for the traffic-driven expiry sweep (`maybeSweepExpired`): at most
 *  one sweep per this interval per instance. Free sessions are admitted
 *  immediately on request — there is no admission tick — so expiry cleanup is
 *  driven opportunistically off the request path instead of a background loop. */
export const EXPIRY_SWEEP_THROTTLE_MS = 15_000

export const SESSION_GRACE_MS = 30 * 60 * 1000

export function getSessionLengthMs(): number {
  return env.FREEBUFF_SESSION_LENGTH_MS
}

/** Drain window after a session's `expires_at`. During this window the gate
 *  still admits requests so an in-flight agent run can finish, but the CLI is
 *  expected to stop accepting new user prompts. Hard cutoff at
 *  `expires_at + grace`; past that the gate returns `session_expired`. */
export function getSessionGraceMs(): number {
  return SESSION_GRACE_MS
}

/** Candidate per-egress-IP concurrent active-session ceiling, env-overridable
 *  so it can be tuned from the logged distribution without a deploy. Currently
 *  only tags the log line's `wouldBlock` — no request is rejected. See
 *  `requestSession` and docs/freebuff-abuse-detection.md ("Mitigation gap"). */
export function getIpSessionCap(): number {
  return env.FREEBUFF_IP_SESSION_CAP
}

/** Max concurrent desktop multi-session rows a single user may hold at once.
 *  Bounds desktop fan-out so a script can't open hundreds of unlimited-model
 *  sessions on one account. Generous enough for real parallel-tab use; the
 *  premium-bucket cap (one) is enforced separately at the DB level. */
export const FREEBUFF_DESKTOP_MAX_CONCURRENT_SESSIONS = 8

/** Only emit the per-IP concurrency log when an admission pushes a hash to at
 *  least this many concurrent active sessions. Filters out the long tail of
 *  singleton / low-concurrency IPs so the log stays cheap while still capturing
 *  the shared-NAT-vs-farm distribution needed to set the real cap. Fixed
 *  constant (not env-tuned like the cap) — a measurement detail, not a knob. */
export const IP_SESSION_LOG_FLOOR = 5
