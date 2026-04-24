import {
  FREEBUFF_DEPLOYMENT_HOURS_LABEL,
  isFreebuffModelAvailable,
  isFreebuffModelId as isSelectableFreebuffModel,
  resolveFreebuffModel,
} from '@codebuff/common/constants/freebuff-models'

import {
  getInstantAdmitCapacity,
  getSessionGraceMs,
  getSessionLengthMs,
  isWaitingRoomBypassedForEmail,
  isWaitingRoomEnabled,
} from './config'
import {
  activeCountForModel,
  endSession,
  FreeSessionModelLockedError,
  getSessionRow,
  joinOrTakeOver,
  listRecentAdmits,
  promoteQueuedUser,
  queueDepthsByModel,
  queuePositionFor,
} from './store'
import { toSessionStateResponse } from './session-view'

import type {
  FreebuffSessionRateLimit,
  FreebuffSessionServerResponse,
} from '@codebuff/common/types/freebuff-session'
import type { InternalSessionRow, SessionStateResponse } from './types'

/**
 * Per-model admission rate limits. Keyed by freebuff model id; a model not
 * in the map has no rate limit applied. Today only GLM 5.1 is limited
 * (Minimax is cheap enough to leave unlimited).
 *
 * Hard-coded rather than env-driven: the values need to be observable in the
 * code review, and the CLI already renders the numbers via `rateLimit` on
 * queued/active responses — changing them is a deliberate, typed edit.
 */
const RATE_LIMITS: Record<string, { limit: number; windowHours: number }> = {
  'z-ai/glm-5.1': { limit: 5, windowHours: 20 },
}

/** Fetch the caller's current quota snapshot for `model`, or undefined if the
 *  model isn't rate-limited. Used by both POST (after admit) and GET polls so
 *  the CLI's "N of M sessions used" line stays live instead of disappearing
 *  after the first poll. Also returns the oldest admit in-window so callers
 *  that need `retryAfterMs` don't have to re-query. */
async function fetchRateLimitSnapshot(
  userId: string,
  model: string,
  deps: SessionDeps,
): Promise<
  { info: FreebuffSessionRateLimit; oldest: Date | null } | undefined
> {
  const cfg = RATE_LIMITS[model]
  if (!cfg) return undefined
  const now = nowOf(deps)
  const since = new Date(now.getTime() - cfg.windowHours * 60 * 60 * 1000)
  const admits = await deps.listRecentAdmits({
    userId,
    model,
    since,
    limit: cfg.limit,
  })
  return {
    info: {
      model,
      limit: cfg.limit,
      windowHours: cfg.windowHours,
      recentCount: admits.length,
    },
    oldest: admits[0] ?? null,
  }
}

export interface SessionDeps {
  getSessionRow: (userId: string) => Promise<InternalSessionRow | null>
  joinOrTakeOver: (params: {
    userId: string
    model: string
    now: Date
  }) => Promise<InternalSessionRow>
  endSession: (userId: string) => Promise<void>
  queueDepthsByModel: () => Promise<Record<string, number>>
  queuePositionFor: (params: {
    userId: string
    model: string
    queuedAt: Date
  }) => Promise<number>
  /** Instant-admit check: returns the number of active sessions currently
   *  bound to a given model. Compared against the model's configured
   *  `instantAdmitCapacity` to decide whether a new joiner skips the queue. */
  activeCountForModel: (model: string) => Promise<number>
  /** Rate-limit helper: oldest-first admission timestamps for (userId, model)
   *  inside the window. The caller uses `rows.length` as the count (capped
   *  at `limit`) and `rows[0]` as the oldest for `retryAfterMs`. */
  listRecentAdmits: (params: {
    userId: string
    model: string
    since: Date
    limit: number
  }) => Promise<Date[]>
  /** Instant-admit promotion: flips a specific queued row to active. Returns
   *  the updated row or null if the row wasn't in a queued state. */
  promoteQueuedUser: (params: {
    userId: string
    model: string
    sessionLengthMs: number
    now: Date
  }) => Promise<InternalSessionRow | null>
  /** Per-model capacity lookup. Indirected through deps so tests can
   *  force-enable / force-disable instant admit without mutating the
   *  shared model registry. */
  getInstantAdmitCapacity: (model: string) => number
  isWaitingRoomEnabled: () => boolean
  /** Plain values, not getters: these never change at runtime. The deps
   *  interface uses values rather than thunks so tests can pass numbers
   *  inline without wrapping. */
  graceMs: number
  sessionLengthMs: number
  now?: () => Date
}

const defaultDeps: SessionDeps = {
  getSessionRow,
  joinOrTakeOver,
  endSession,
  queueDepthsByModel,
  queuePositionFor,
  activeCountForModel,
  listRecentAdmits,
  promoteQueuedUser,
  getInstantAdmitCapacity,
  isWaitingRoomEnabled,
  get graceMs() {
    // Read-through getter so test overrides via env still work; the value
    // itself is materialized once per call. Cheaper than a thunk because
    // callers don't have to invoke a function.
    return getSessionGraceMs()
  },
  get sessionLengthMs() {
    return getSessionLengthMs()
  },
}

const nowOf = (deps: SessionDeps): Date => (deps.now ?? (() => new Date()))()

async function viewForRow(
  userId: string,
  deps: SessionDeps,
  row: InternalSessionRow,
): Promise<SessionStateResponse | null> {
  const [position, depthsByModel] =
    row.status === 'queued'
      ? await Promise.all([
          deps.queuePositionFor({
            userId,
            model: row.model,
            queuedAt: row.queued_at,
          }),
          deps.queueDepthsByModel(),
        ])
      : [0, {}]
  return toSessionStateResponse({
    row,
    position,
    queueDepthByModel: depthsByModel,
    graceMs: deps.graceMs,
    now: nowOf(deps),
  })
}

export type RequestSessionResult =
  | SessionStateResponse
  | {
      /** User asked to queue/switch to a different model while their active
       *  session is still bound to another. The CLI must end the existing
       *  session first (DELETE /session) before re-queueing. */
      status: 'model_locked'
      currentModel: string
      requestedModel: string
    }
  | {
      /** User has hit the per-model admission quota in the rolling window.
       *  See `FreebuffSessionServerResponse`'s `rate_limited` variant. */
      status: 'rate_limited'
      model: string
      limit: number
      windowHours: number
      recentCount: number
      retryAfterMs: number
    }
  | {
      status: 'model_unavailable'
      requestedModel: string
      availableHours: string
    }

/**
 * Client calls this on CLI startup with the model they want to use.
 * Semantics:
 *   - Waiting room disabled → { status: 'disabled' } (model still respected
 *     downstream by chat-completions)
 *   - No existing session → create queued row for `model`, fresh instance_id
 *   - Existing active (unexpired), same model → rotate instance_id (takeover)
 *   - Existing active (unexpired), different model → { status: 'model_locked' }
 *   - Existing queued, same model → rotate instance_id, preserve position
 *   - Existing queued, different model → switch to new model and join the
 *     back of that model's queue
 *   - Existing expired → re-queue at the back of `model`'s queue with fresh
 *     instance_id
 *
 * `joinOrTakeOver` (when it doesn't throw) always returns a row that maps to
 * a non-null view (queued or active-unexpired), so the cast below is sound.
 */
export async function requestSession(params: {
  userId: string
  model: string
  userEmail?: string | null | undefined
  /** True if the account is banned. Short-circuited here so banned bots never
   *  create a queued row — otherwise they inflate `queueDepth` between the
   *  15s admission ticks that run `evictBanned`. */
  userBanned?: boolean
  deps?: SessionDeps
}): Promise<RequestSessionResult> {
  const deps = params.deps ?? defaultDeps
  const model = resolveFreebuffModel(params.model)
  const now = nowOf(deps)
  if (params.userBanned) {
    return { status: 'banned' }
  }
  if (
    !deps.isWaitingRoomEnabled() ||
    isWaitingRoomBypassedForEmail(params.userEmail)
  ) {
    return { status: 'disabled' }
  }
  if (!isFreebuffModelAvailable(model, now)) {
    return {
      status: 'model_unavailable',
      requestedModel: model,
      availableHours: FREEBUFF_DEPLOYMENT_HOURS_LABEL,
    }
  }

  // Rate-limit check runs before joinOrTakeOver so heavy users never even
  // create a queued row. Only models listed in RATE_LIMITS are gated; others
  // (Minimax today) fall through unchanged.
  //
  // Takeover/reclaim exception: a user who already holds a queued or
  // active+unexpired row on this same model is re-anchoring (CLI restart,
  // same-account tab switch) rather than starting a new session. Admit
  // counts are written at promotion time, so the quota only needs to gate
  // fresh admissions — blocking a reclaim here would strand a user with an
  // active 5th session unable to reconnect after a CLI restart.
  const existing = await deps.getSessionRow(params.userId)
  const isReclaim =
    !!existing &&
    existing.model === model &&
    (existing.status === 'queued' ||
      (existing.status === 'active' &&
        !!existing.expires_at &&
        existing.expires_at.getTime() > now.getTime()))

  if (!isReclaim) {
    const snapshot = await fetchRateLimitSnapshot(params.userId, model, deps)
    if (snapshot && snapshot.info.recentCount >= snapshot.info.limit) {
      // Oldest admit's window-anniversary is when one slot opens back up.
      // Clamped at 0 so a clock skew can't surface a negative retry-after.
      const windowMs = snapshot.info.windowHours * 60 * 60 * 1000
      const retryAfterMs = Math.max(
        0,
        (snapshot.oldest?.getTime() ?? 0) + windowMs - now.getTime(),
      )
      return {
        status: 'rate_limited',
        model,
        limit: snapshot.info.limit,
        windowHours: snapshot.info.windowHours,
        recentCount: snapshot.info.recentCount,
        retryAfterMs,
      }
    }
  }

  let row: InternalSessionRow
  try {
    row = await deps.joinOrTakeOver({
      userId: params.userId,
      model,
      now,
    })
  } catch (err) {
    if (err instanceof FreeSessionModelLockedError) {
      return {
        status: 'model_locked',
        currentModel: err.currentModel,
        requestedModel: model,
      }
    }
    throw err
  }

  // Instant-admit: if the model has spare capacity (fewer active sessions
  // than its configured `instantAdmitCapacity`), skip the waiting room
  // entirely and flip the user to active in this same request. The tick
  // + FIFO queue only engage once we hit the threshold, so backpressure
  // kicks in exactly when the deployment needs it.
  //
  // Race note: two concurrent joiners may each see `active < capacity`
  // and both get admitted, overshooting the cap by up to `concurrency - 1`.
  // Capacities are chosen with headroom for this, and the configured
  // value is a comfort threshold not a hard ceiling.
  if (row.status === 'queued') {
    const capacity = deps.getInstantAdmitCapacity(model)
    if (capacity > 0) {
      const activeCount = await deps.activeCountForModel(model)
      if (activeCount < capacity) {
        const promoted = await deps.promoteQueuedUser({
          userId: params.userId,
          model,
          sessionLengthMs: deps.sessionLengthMs,
          now,
        })
        if (promoted) row = promoted
      }
    }
  }

  const view = await viewForRow(params.userId, deps, row)
  if (!view) {
    throw new Error(
      `joinOrTakeOver returned a row that maps to no view (user=${params.userId})`,
    )
  }
  return attachRateLimit(params.userId, view, deps)
}

/** Thread the current quota snapshot onto queued/active views so the CLI can
 *  render "N of M sessions used". Other statuses pass through unchanged.
 *  Called on both POST and GET so the line stays live across polls. */
async function attachRateLimit(
  userId: string,
  view: SessionStateResponse,
  deps: SessionDeps,
): Promise<SessionStateResponse> {
  if (view.status !== 'queued' && view.status !== 'active') return view
  const snapshot = await fetchRateLimitSnapshot(userId, view.model, deps)
  if (!snapshot) return view
  return { ...view, rateLimit: snapshot.info }
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
  userEmail?: string | null | undefined
  userBanned?: boolean
  claimedInstanceId?: string | null | undefined
  deps?: SessionDeps
}): Promise<FreebuffSessionServerResponse> {
  const deps = params.deps ?? defaultDeps
  if (params.userBanned) {
    return { status: 'banned' }
  }
  if (
    !deps.isWaitingRoomEnabled() ||
    isWaitingRoomBypassedForEmail(params.userEmail)
  ) {
    return { status: 'disabled' }
  }
  const row = await deps.getSessionRow(params.userId)

  // Build a `none` response with live queue depths so the CLI's pre-join
  // picker can show "N ahead" hints without first committing the user to a
  // queue. Cheap snapshot — no user-scoped state.
  const noneResponse = async (): Promise<FreebuffSessionServerResponse> => ({
    status: 'none',
    queueDepthByModel: await deps.queueDepthsByModel(),
  })

  if (!row) return noneResponse()

  if (
    row.status === 'active' &&
    params.claimedInstanceId &&
    params.claimedInstanceId !== row.active_instance_id
  ) {
    return { status: 'superseded' }
  }

  const view = await viewForRow(params.userId, deps, row)
  if (!view) return noneResponse()
  return attachRateLimit(params.userId, view, deps)
}

export async function endUserSession(params: {
  userId: string
  userEmail?: string | null | undefined
  deps?: SessionDeps
}): Promise<void> {
  const deps = params.deps ?? defaultDeps
  if (
    !deps.isWaitingRoomEnabled() ||
    isWaitingRoomBypassedForEmail(params.userEmail)
  ) {
    return
  }
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
  /** Active session locked to a different model than the one requested. The
   *  CLI should restart its session (DELETE then POST) to switch models. */
  | { ok: false; code: 'session_model_mismatch'; message: string }
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
  userEmail?: string | null | undefined
  claimedInstanceId: string | null | undefined
  /** Model the chat-completions request is for. When provided, the gate
   *  rejects requests whose model doesn't match the active session's model
   *  so a stale CLI tab can't slip a request through under the wrong model. */
  requestedModel?: string | null | undefined
  deps?: SessionDeps
}): Promise<SessionGateResult> {
  const deps = params.deps ?? defaultDeps
  if (
    !deps.isWaitingRoomEnabled() ||
    isWaitingRoomBypassedForEmail(params.userEmail)
  ) {
    return { ok: true, reason: 'disabled' }
  }

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

  // Reject requests for a model the session isn't bound to. Sub-agents may
  // legitimately use other models (Gemini Flash etc.) so we only enforce this
  // when the caller provides a requestedModel — and only against the set of
  // selectable freebuff models (resolveFreebuffModel returns the canonical id
  // or the default for anything outside the registry).
  if (
    params.requestedModel &&
    isSelectableFreebuffModel(params.requestedModel) &&
    params.requestedModel !== row.model
  ) {
    return {
      ok: false,
      code: 'session_model_mismatch',
      message: `This session is bound to ${row.model}; restart freebuff to switch models.`,
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
