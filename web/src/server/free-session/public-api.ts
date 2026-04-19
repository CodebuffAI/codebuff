import {
  ADMISSION_TICK_MS,
  MAX_ADMITS_PER_TICK,
  getSessionGraceMs,
  isWaitingRoomEnabled,
} from './config'
import {
  endSession,
  getSessionRow,
  joinOrTakeOver,
  queueDepth,
  queuePositionFor,
} from './store'
import { toSessionStateResponse } from './session-view'

import type { InternalSessionRow, SessionStateResponse } from './types'

export interface SessionDeps {
  getSessionRow: (userId: string) => Promise<InternalSessionRow | null>
  joinOrTakeOver: (params: { userId: string; now: Date }) => Promise<InternalSessionRow>
  endSession: (userId: string) => Promise<void>
  queueDepth: () => Promise<number>
  queuePositionFor: (params: { userId: string; queuedAt: Date }) => Promise<number>
  isWaitingRoomEnabled: () => boolean
  getAdmissionTickMs: () => number
  getMaxAdmitsPerTick: () => number
  getSessionGraceMs: () => number
  now?: () => Date
}

const defaultDeps: SessionDeps = {
  getSessionRow,
  joinOrTakeOver,
  endSession,
  queueDepth,
  queuePositionFor,
  isWaitingRoomEnabled,
  getAdmissionTickMs: () => ADMISSION_TICK_MS,
  getMaxAdmitsPerTick: () => MAX_ADMITS_PER_TICK,
  getSessionGraceMs,
}

const nowOf = (deps: SessionDeps): Date => (deps.now ?? (() => new Date()))()

async function viewForRow(
  userId: string,
  deps: SessionDeps,
  row: InternalSessionRow,
): Promise<SessionStateResponse | null> {
  const [position, depth] =
    row.status === 'queued'
      ? await Promise.all([
          deps.queuePositionFor({ userId, queuedAt: row.queued_at }),
          deps.queueDepth(),
        ])
      : [0, 0]
  return toSessionStateResponse({
    row,
    position,
    queueDepth: depth,
    admissionTickMs: deps.getAdmissionTickMs(),
    maxAdmitsPerTick: deps.getMaxAdmitsPerTick(),
    graceMs: deps.getSessionGraceMs(),
    now: nowOf(deps),
  })
}

/**
 * Client calls this on CLI startup. Semantics:
 *   - Waiting room disabled → { status: 'disabled' }
 *   - No existing session → create queued row, fresh instance_id
 *   - Existing active (unexpired) → rotate instance_id (takeover), preserve state
 *   - Existing queued → rotate instance_id, preserve queue position
 *   - Existing expired → re-queue at the back with fresh instance_id
 */
export async function requestSession(params: {
  userId: string
  deps?: SessionDeps
}): Promise<SessionStateResponse> {
  const deps = params.deps ?? defaultDeps
  if (!deps.isWaitingRoomEnabled()) return { status: 'disabled' }

  const row = await deps.joinOrTakeOver({ userId: params.userId, now: nowOf(deps) })
  // joinOrTakeOver always returns either a queued row or an active-valid row,
  // both of which map to a non-null response.
  const view = await viewForRow(params.userId, deps, row)
  if (!view) {
    throw new Error(
      `unreachable: joinOrTakeOver returned unmappable row for user=${params.userId} status=${row.status} expires_at=${row.expires_at?.toISOString() ?? 'null'}`,
    )
  }
  return view
}

/**
 * Read-only check of the caller's current state. Does not mutate or rotate
 * instance_id. Returns null when the user has no session row at all (or only
 * an expired active row) — the CLI should interpret that as "call
 * requestSession() first".
 */
export async function getSessionState(params: {
  userId: string
  deps?: SessionDeps
}): Promise<SessionStateResponse | null> {
  const deps = params.deps ?? defaultDeps
  if (!deps.isWaitingRoomEnabled()) return { status: 'disabled' }
  const row = await deps.getSessionRow(params.userId)
  if (!row) return null
  return viewForRow(params.userId, deps, row)
}

export async function endUserSession(params: {
  userId: string
  deps?: SessionDeps
}): Promise<void> {
  const deps = params.deps ?? defaultDeps
  if (!deps.isWaitingRoomEnabled()) return
  await deps.endSession(params.userId)
}

export type SessionGateResult =
  | { ok: true; reason: 'disabled' }
  | { ok: true; reason: 'active'; remainingMs: number }
  | {
      ok: true
      reason: 'draining'
      /** Time remaining until the hard cutoff (`expires_at + grace`). */
      gracePeriodRemainingMs: number
    }
  | { ok: false; code: 'waiting_room_required'; message: string }
  | { ok: false; code: 'waiting_room_queued'; message: string }
  | { ok: false; code: 'session_superseded'; message: string }
  | { ok: false; code: 'session_expired'; message: string }

/**
 * Called from the chat/completions hot path for free-mode requests. Either
 * returns `{ ok: true }` (request may proceed) or a structured rejection
 * the caller translates into a 4xx response.
 *
 * Never trusts client timestamps. The caller supplies `claimedInstanceId`
 * exactly as the CLI sent it; we compare against the server-stored
 * active_instance_id. Does a single DB read (the row); we intentionally do
 * NOT compute queue position on rejection — the client polls GET /session
 * for that detail.
 */
export async function checkSessionAdmissible(params: {
  userId: string
  claimedInstanceId: string | null | undefined
  deps?: SessionDeps
}): Promise<SessionGateResult> {
  const deps = params.deps ?? defaultDeps
  if (!deps.isWaitingRoomEnabled()) return { ok: true, reason: 'disabled' }

  const row = await deps.getSessionRow(params.userId)

  if (!row) {
    return {
      ok: false,
      code: 'waiting_room_required',
      message: 'No active free session. Call POST /api/v1/freebuff/session first.',
    }
  }

  if (row.status === 'queued') {
    return {
      ok: false,
      code: 'waiting_room_queued',
      message: 'You are in the waiting room. Poll GET /api/v1/freebuff/session for your position.',
    }
  }

  const now = nowOf(deps)
  const nowMs = now.getTime()
  const expiresAtMs = row.expires_at?.getTime() ?? 0
  const graceMs = deps.getSessionGraceMs()
  // Past the hard cutoff (`expires_at + grace`). The grace window lets the CLI
  // finish an in-flight agent run after the user's session ended; once it's
  // gone, we fall back to the same re-queue flow as a regular expiry.
  if (!row.expires_at || expiresAtMs + graceMs <= nowMs) {
    return {
      ok: false,
      code: 'session_expired',
      message: 'Your free session has expired. Re-join the waiting room via POST /api/v1/freebuff/session.',
    }
  }

  if (!params.claimedInstanceId || params.claimedInstanceId !== row.active_instance_id) {
    return {
      ok: false,
      code: 'session_superseded',
      message: 'Another instance of freebuff has taken over this session. Only one instance per account is allowed.',
    }
  }

  if (expiresAtMs > nowMs) {
    return {
      ok: true,
      reason: 'active',
      remainingMs: expiresAtMs - nowMs,
    }
  }

  // Inside the grace window: still admit so the agent can finish, but signal
  // to the caller (and via metrics) that no new user prompts should arrive.
  return {
    ok: true,
    reason: 'draining',
    gracePeriodRemainingMs: expiresAtMs + graceMs - nowMs,
  }
}
