import { env } from '@codebuff/common/env'
import { useEffect } from 'react'

import {
  getSelectedFreebuffModel,
  useFreebuffModelStore,
} from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { getAuthTokenDetails } from '../utils/auth'
import { IS_FREEBUFF } from '../utils/constants'
import { logger } from '../utils/logger'

import type { FreebuffSessionResponse } from '../types/freebuff-session'

const POLL_INTERVAL_QUEUED_MS = 5_000
const POLL_INTERVAL_ACTIVE_MS = 30_000
const POLL_INTERVAL_ERROR_MS = 10_000

/** Header sent on GET so the server can detect when another CLI on the same
 *  account has rotated the id and respond with `{ status: 'superseded' }`. */
const FREEBUFF_INSTANCE_HEADER = 'x-freebuff-instance-id'

/** Header sent on POST telling the server which model's queue to join. */
const FREEBUFF_MODEL_HEADER = 'x-freebuff-model'

/** Play the terminal bell so users get an audible notification on admission. */
const playAdmissionSound = () => {
  try {
    process.stdout.write('\x07')
  } catch {
    // Silent fallback — some terminals/pipes disallow writing to stdout.
  }
}

const sessionEndpoint = (): string => {
  const base = (env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com').replace(/\/$/, '')
  return `${base}/api/v1/freebuff/session`
}

async function callSession(
  method: 'POST' | 'GET' | 'DELETE',
  token: string,
  opts: { instanceId?: string; model?: string; signal?: AbortSignal } = {},
): Promise<FreebuffSessionResponse> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (method === 'GET' && opts.instanceId) {
    headers[FREEBUFF_INSTANCE_HEADER] = opts.instanceId
  }
  if (method === 'POST' && opts.model) {
    headers[FREEBUFF_MODEL_HEADER] = opts.model
  }
  const resp = await fetch(sessionEndpoint(), {
    method,
    headers,
    signal: opts.signal,
  })
  // 404 = endpoint not deployed on this server (older web build). Treat as
  // "waiting room disabled" so a newer CLI against an older server still
  // works, rather than stranding users in a waiting room forever.
  if (resp.status === 404) {
    return { status: 'disabled' }
  }
  // 403 with a country_blocked body is a terminal signal, not an error — the
  // server rejects non-allowlist countries up front (see session _handlers.ts)
  // so users don't wait through the queue only to be rejected at chat time.
  // The 403 status (rather than 200) is deliberate: older CLIs that don't
  // know this status treat it as a generic error and back off on the 10s
  // error-retry cadence instead of tight-polling an unrecognized 200 body.
  if (resp.status === 403) {
    const body = (await resp.json().catch(() => null)) as
      | FreebuffSessionResponse
      | null
    if (body && body.status === 'country_blocked') {
      return body
    }
  }
  // 409 from POST means the user picked a different model than their active
  // session is bound to. Surface as a non-throw `model_locked` so the UI can
  // show a confirmation prompt (DELETE then re-POST to switch).
  if (resp.status === 409 && method === 'POST') {
    const body = (await resp.json().catch(() => null)) as
      | FreebuffSessionResponse
      | null
    if (body && body.status === 'model_locked') {
      return body
    }
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(
      `freebuff session ${method} failed: ${resp.status} ${text.slice(0, 200)}`,
    )
  }
  return (await resp.json()) as FreebuffSessionResponse
}

/** Picks the poll delay after a successful tick. Returns null when the state
 *  is terminal (no further polling). */
function nextDelayMs(next: FreebuffSessionResponse): number | null {
  switch (next.status) {
    case 'queued':
      return POLL_INTERVAL_QUEUED_MS
    case 'active':
      // Poll at the normal cadence, but ensure we land just after
      // `expires_at` so the transition shows up promptly instead of leaving
      // the countdown stuck at 0 for up to a full interval.
      return Math.max(
        1_000,
        Math.min(POLL_INTERVAL_ACTIVE_MS, next.remainingMs + 1_000),
      )
    case 'ended':
      // Inside the grace window we keep checking so the post-grace transition
      // (server returns `none`, we synthesize ended-no-instanceId) is prompt.
      return next.instanceId ? POLL_INTERVAL_ACTIVE_MS : null
    case 'none':
    case 'disabled':
    case 'superseded':
    case 'country_blocked':
    case 'model_locked':
      return null
  }
}

// --- Poll-loop control surface ---------------------------------------------
//
// The hook below registers a controller object here on mount; module-level
// imperative functions (refresh / mark superseded / mark ended / etc.) talk
// to it without going through React. Non-React callers (chat-completions
// gate, exit paths) hit those functions directly.

interface PollController {
  refresh: () => Promise<void>
  apply: (next: FreebuffSessionResponse) => void
  abort: () => void
  setHasPosted: (value: boolean) => void
}

let controller: PollController | null = null

/** Read the current instance id for outgoing chat requests. Includes `ended`
 *  so in-flight agent work can keep streaming during the server-side grace
 *  window (server keeps the row alive until `expires_at + grace`). */
export function getFreebuffInstanceId(): string | undefined {
  const current = useFreebuffSessionStore.getState().session
  if (!current) return undefined
  switch (current.status) {
    case 'queued':
    case 'active':
    case 'ended':
      return current.instanceId
    default:
      return undefined
  }
}

/**
 * Re-POST to the server (rejoining the queue / rotating the instance id).
 * Pass `resetChat: true` to also wipe local chat history — used when
 * rejoining after a session ended so the next admitted session starts fresh.
 */
export async function refreshFreebuffSession(opts: { resetChat?: boolean } = {}): Promise<void> {
  if (!IS_FREEBUFF) return
  if (opts.resetChat) {
    const { useChatStore } = await import('../state/chat-store')
    useChatStore.getState().reset()
  }
  await controller?.refresh()
}

/**
 * User picked a different model in the waiting room. Persist the choice and
 * re-POST so the server moves them to the back of the new model's queue. If
 * the server has already admitted them on a different model, it responds
 * with `model_locked`; the tick loop silently reverts the local selection to
 * the locked model so the active session stays intact. Users who really want
 * to switch can /end-session deliberately.
 */
export async function switchFreebuffModel(model: string): Promise<void> {
  if (!IS_FREEBUFF) return
  const { setSelectedModel } = useFreebuffModelStore.getState()
  setSelectedModel(model)
  await controller?.refresh()
}

/**
 * End the current session and immediately rejoin the queue. Used by the
 * "switch model" confirmation flow when the server returned `model_locked`,
 * and by any UI that lets the user exit an active session early.
 */
export async function endAndRejoinFreebuffSession(): Promise<void> {
  if (!IS_FREEBUFF) return
  const { token } = getAuthTokenDetails()
  if (!token) return
  try {
    await callSession('DELETE', token)
  } catch {
    // Best-effort — even if DELETE fails the re-POST below will eventually
    // succeed once the server-side sweep catches up.
  }
  const { useChatStore } = await import('../state/chat-store')
  useChatStore.getState().reset()
  await controller?.refresh()
}

export function markFreebuffSessionSuperseded(): void {
  if (!IS_FREEBUFF) return
  controller?.abort()
  controller?.apply({ status: 'superseded' })
}

/** Flip into the local `ended` state without an instanceId (server has lost
 *  our row). The chat surface stays mounted with the rejoin banner. */
export function markFreebuffSessionEnded(): void {
  if (!IS_FREEBUFF) return
  controller?.abort()
  controller?.apply({ status: 'ended' })
}

/** True when the session row represents a server-side slot the caller is
 *  holding (queued, active, or in the post-expiry grace window with a live
 *  instance id). DELETE only matters in those states; otherwise we'd fire a
 *  spurious request the server has nothing to act on. */
function shouldReleaseSlot(
  current: FreebuffSessionResponse | null,
): boolean {
  if (!current) return false
  return (
    current.status === 'queued' ||
    current.status === 'active' ||
    (current.status === 'ended' && Boolean(current.instanceId))
  )
}

/**
 * Best-effort DELETE of the caller's session row. Used by exit paths that
 * skip React unmount (process.exit on Ctrl+C) so the seat frees up quickly
 * instead of waiting for the server-side expiry sweep.
 */
export async function endFreebuffSessionBestEffort(): Promise<void> {
  if (!IS_FREEBUFF) return
  const current = useFreebuffSessionStore.getState().session
  if (!shouldReleaseSlot(current)) return
  const { token } = getAuthTokenDetails()
  if (!token) return
  try {
    await callSession('DELETE', token)
  } catch {
    // swallow — we're exiting
  }
}

interface UseFreebuffSessionResult {
  session: FreebuffSessionResponse | null
  error: string | null
}

/**
 * Manages the freebuff waiting-room session lifecycle:
 *   - POST on mount to join the queue / rotate instance id
 *   - polls GET while queued (fast) or active (slow) to keep state fresh
 *   - re-POSTs on explicit refresh (chat gate rejected us)
 *   - DELETE on unmount so the slot frees up for the next user
 *   - plays a bell on transition from queued → active
 */
export function useFreebuffSession(): UseFreebuffSessionResult {
  const session = useFreebuffSessionStore((s) => s.session)
  const error = useFreebuffSessionStore((s) => s.error)

  useEffect(() => {
    const { setSession, setError } = useFreebuffSessionStore.getState()

    if (!IS_FREEBUFF) {
      setSession({ status: 'disabled' })
      return
    }

    const { token } = getAuthTokenDetails()
    if (!token) {
      logger.warn(
        {},
        '[freebuff-session] No auth token; skipping waiting-room admission',
      )
      setError('Not authenticated')
      return
    }

    let cancelled = false
    let abortController = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    let previousStatus: FreebuffSessionResponse['status'] | null = null
    let hasPosted = false

    const apply = (next: FreebuffSessionResponse) => {
      setSession(next)
      setError(null)
      previousStatus = next.status
    }

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const schedule = (ms: number) => {
      if (cancelled) return
      clearTimer()
      timer = setTimeout(tick, ms)
    }

    const tick = async () => {
      if (cancelled) return
      // POST when we don't yet hold a seat; thereafter GET. The
      // active|ended → none edge is special-cased below so we don't silently
      // re-POST out from under an in-flight agent.
      const method: 'POST' | 'GET' = hasPosted ? 'GET' : 'POST'
      const instanceId = getFreebuffInstanceId()
      const model = getSelectedFreebuffModel()
      try {
        const next = await callSession(method, token, {
          signal: abortController.signal,
          instanceId,
          model,
        })
        if (cancelled) return
        hasPosted = true

        // Race recovery: user picked a different model in the waiting room at
        // the exact moment the server admitted them with the original model.
        // Silently revert the local selection and re-tick so the next call
        // (a GET) lands the actual active session. Users who really want to
        // switch can /end-session deliberately.
        if (next.status === 'model_locked') {
          useFreebuffModelStore.getState().setSelectedModel(next.currentModel)
          schedule(0)
          return
        }

        if (previousStatus === 'queued' && next.status === 'active') {
          playAdmissionSound()
        }

        // active|ended → none means we've passed the server's hard cutoff.
        // Synthesize a no-instanceId ended state so the chat surface stays
        // mounted with the Enter-to-rejoin banner instead of looping back
        // through the waiting room.
        if (
          (previousStatus === 'active' || previousStatus === 'ended') &&
          next.status === 'none'
        ) {
          apply({ status: 'ended' })
          return
        }

        apply(next)
        const delay = nextDelayMs(next)
        if (delay !== null) schedule(delay)
      } catch (err) {
        if (cancelled || abortController.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn({ error: msg }, '[freebuff-session] fetch failed')
        setError(msg)
        schedule(POLL_INTERVAL_ERROR_MS)
      }
    }

    controller = {
      refresh: async () => {
        clearTimer()
        // Abort any in-flight fetch so it can't race us and overwrite state.
        abortController.abort()
        abortController = new AbortController()
        // Reset previousStatus so the queued→active bell still fires after
        // a forced re-POST.
        previousStatus = null
        hasPosted = false
        await tick()
      },
      apply,
      abort: () => {
        clearTimer()
        abortController.abort()
      },
      setHasPosted: (value) => {
        hasPosted = value
      },
    }

    tick()

    return () => {
      cancelled = true
      abortController.abort()
      clearTimer()
      const current = useFreebuffSessionStore.getState().session
      controller = null

      // Fire-and-forget DELETE. Only release if we actually held a slot so
      // we don't generate spurious DELETEs (e.g. HMR before POST completes).
      if (shouldReleaseSlot(current)) {
        callSession('DELETE', token).catch(() => {})
      }
      setSession(null)
      setError(null)
    }
  }, [])

  return { session, error }
}
