import {
  ADMISSION_TICK_MS,
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

import type { FreebuffSessionServerResponse } from '@codebuff/common/types/freebuff-session'
import type { InternalSessionRow, SessionStateResponse } from './types'

export interface SessionDeps {
  getSessionRow: (userId: string) => Promise<InternalSessionRow | null>
  joinOrTakeOver: (params: { userId: string; now: Date }) => Promise<InternalSessionRow>
  endSession: (userId: string) => Promise<void>
  queueDepth: () => Promise<number>
  queuePositionFor: (params: { userId: string; queuedAt: Date }) => Promise<number>
  isWaitingRoomEnabled: () => boolean
  /** Plain values, not getters: these never change at runtime. The deps
   *  interface uses values rather than thunks so tests can pass numbers
   *  inline without wrapping. */
  admissionTickMs: number
  graceMs: number
  now?: () => Date
}

const defaultDeps: SessionDeps = {
  getSessionRow,
  joinOrTakeOver,
  endSession,
  queueDepth,
  queuePositionFor,
  isWaitingRoomEnabled,
  admissionTickMs: ADMISSION_TICK_MS,
  get graceMs() {
    // Read-through getter so test overrides via env still work; the value
    // itself is materialized once per call. Cheaper than a thunk because
    // callers don't have to invoke a function.
    return getSessionGraceMs()
  },
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
    admissionTickMs: deps.admissionTickMs,
    graceMs: deps.graceMs,
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
 *
 * `joinOrTakeOver` always returns a row that maps to a non-null view (queued
 * or active-unexpired), so the cast below is sound.
 */
export async function requestSession(params: {
  userId: string
  deps?: SessionDeps
}): Promise<SessionStateResponse> {
  const deps = params.deps ?? defaultDeps
  if (!deps.isWaitingRoomEnabled()) return { status: 'disabled' }

  const row = await deps.joinOrTakeOver({ userId: params.userId, now: nowOf(deps) })
  const view = await viewForRow(params.userId, deps, row)
  if (!view) {
    throw new Error(
      `joinOrTakeOver returned a row that maps to no view (user=${params.userId})`,
    )
  }
  return view
}

/**
 * Read-only check of the caller's current state. Does not mutate or rotate
 * `instance_id`. The CLI sends its currently-held `claimedInstanceId` so we
 * can return `superseded` if a newer CLI on the same account took over.
 *
 * Returns:
 *   - `disabled` when the waiting room is off
 *   - `none` when the user has no row at all (or the row was swept past
 *     the grace window)
 *   - `superseded` when the caller's id no longer matches the stored one
 *     (active sessions only — a queued row's id always wins)
 *   - `queued` / `active` / `ended` otherwise (see `toSessionStateResponse`)
 */
export async function getSessionState(params: {
  userId: string
  claimedInstanceId?: string | null | undefined
  deps?: SessionDeps
}): Promise<FreebuffSessionServerResponse> {
  const deps = params.deps ?? defaultDeps
  if (!deps.isWaitingRoomEnabled()) return { status: 'disabled' }
  const row = await deps.getSessionRow(params.userId)
  if (!row) return { status: 'none' }

  if (
    row.status === 'active' &&
    params.claimedInstanceId &&
    params.claimedInstanceId !== row.active_instance_id
  ) {
    return { status: 'superseded' }
  }

  const view = await viewForRow(params.userId, deps, row)
  if (!view) return { status: 'none' }
  return view
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
  /** Pre-waiting-room CLI that never sends an instance id. Surfaced as a
   *  distinct code so the caller can prompt the user to restart. */
  | { ok: false; code: 'freebuff_update_required'; message: string }

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

  // Pre-waiting-room CLIs never send a freebuff_instance_id. Classify that up
  // front so the caller gets a distinct code (→ 426 Upgrade Required) and the
  // user sees a clear "please restart" message instead of a gate reject they
  // can't interpret.
  if (!params.claimedInstanceId) {
    return {
      ok: false,
      code: 'freebuff_update_required',
      message:
        'This version of freebuff is out of date. Please restart freebuff to upgrade and continue using free mode.',
    }
  }

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
  const graceMs = deps.graceMs
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

  if (params.claimedInstanceId !== row.active_instance_id) {
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
