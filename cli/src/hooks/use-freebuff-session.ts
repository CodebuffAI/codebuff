import { env } from '@codebuff/common/env'
import { useEffect, useState } from 'react'

import { getAuthTokenDetails } from '../utils/auth'
import { IS_FREEBUFF } from '../utils/constants'
import { logger } from '../utils/logger'

import type {
  FreebuffSessionResponse,
  FreebuffSessionServerResponse,
} from '../types/freebuff-session'

const POLL_INTERVAL_QUEUED_MS = 5_000
const POLL_INTERVAL_ACTIVE_MS = 30_000
const POLL_INTERVAL_ERROR_MS = 10_000

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
  signal?: AbortSignal,
): Promise<FreebuffSessionServerResponse> {
  const resp = await fetch(sessionEndpoint(), {
    method,
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(
      `freebuff session ${method} failed: ${resp.status} ${text.slice(0, 200)}`,
    )
  }
  return (await resp.json()) as FreebuffSessionServerResponse
}

/**
 * Decide which HTTP verb to use for the next poll. GET is cheap and does not
 * rotate instance_id; POST is used whenever we don't (yet) have a valid seat —
 * no session, server lost our row, or an active session expired.
 */
function nextMethod(current: FreebuffSessionResponse | null): 'POST' | 'GET' {
  if (
    current?.status === 'queued' ||
    current?.status === 'active' ||
    current?.status === 'draining'
  ) {
    return 'GET'
  }
  return 'POST'
}

function nextDelayMs(next: FreebuffSessionResponse): number | null {
  switch (next.status) {
    case 'queued':
      return POLL_INTERVAL_QUEUED_MS
    case 'active':
      // Poll at the normal cadence, but ensure we land just after
      // `expires_at` so the draining transition shows up promptly instead
      // of leaving the countdown stuck at 0 for up to a full interval.
      return Math.max(
        1_000,
        Math.min(POLL_INTERVAL_ACTIVE_MS, next.remainingMs + 1_000),
      )
    case 'draining':
      // Same idea for the hard cutoff — schedule a poll just after
      // `gracePeriodEndsAt` so we catch the transition to `none`/`ended`.
      return Math.max(
        1_000,
        Math.min(
          POLL_INTERVAL_ACTIVE_MS,
          next.gracePeriodRemainingMs + 1_000,
        ),
      )
    case 'none':
      // Server lost our row / active session expired — POST again ASAP.
      return 0
    case 'disabled':
    case 'superseded':
    case 'ended':
      return null
  }
}

interface UseFreebuffSessionResult {
  session: FreebuffSessionResponse | null
  error: string | null
}

interface RefreshHandle {
  refresh: (opts?: { forcePost?: boolean }) => Promise<void>
  markSuperseded: () => void
  markEnded: () => void
  getSession: () => FreebuffSessionResponse | null
}

/**
 * Module-level handle to the active hook's poll driver. Set by the hook's
 * effect on mount; cleared on unmount. Lets external callers (e.g. the
 * chat-completions gate-error handler) request an immediate re-POST without
 * re-plumbing a ref through the component tree, and lets non-React code
 * (send-message, DELETE on exit) read the current session.
 */
let activeRefreshHandle: RefreshHandle | null = null

/**
 * Imperatively re-sync the session with the server. Call this when the
 * chat-completions gate tells us our seat is no longer valid (428, 410).
 * The gate handler knows the server has no valid row for us, so we force a
 * POST to re-queue immediately rather than waiting for a GET→'none'→POST
 * round trip.
 */
export async function refreshFreebuffSession(): Promise<void> {
  if (!IS_FREEBUFF) return
  await activeRefreshHandle?.refresh({ forcePost: true })
}

/**
 * Flip into a terminal `superseded` state. Polling stops and the UI renders
 * a dedicated "close the other CLI and restart" screen. Called after a 409
 * session_superseded so we don't silently fight the other instance for the
 * seat.
 */
export function markFreebuffSessionSuperseded(): void {
  if (!IS_FREEBUFF) return
  activeRefreshHandle?.markSuperseded()
}

/**
 * Flip into a client-only `ended` state. Polling stops, the input box is
 * hidden, and we wait for the user to press Enter to rejoin. Used both when
 * a poll detects we transitioned `active → none` and when the chat gate
 * returns 410 session_expired — in both cases, the agent may still be
 * finishing an in-flight request under the server-side grace period, so we
 * don't want to silently flip into the waiting room.
 */
export function markFreebuffSessionEnded(): void {
  if (!IS_FREEBUFF) return
  activeRefreshHandle?.markEnded()
}

/**
 * Best-effort DELETE of the caller's session row. Used by exit paths that
 * skip React unmount (process.exit on Ctrl+C) so the seat frees up quickly
 * instead of waiting for the server-side expiry sweep. Swallows errors
 * because we are about to terminate anyway.
 */
export async function endFreebuffSessionBestEffort(): Promise<void> {
  if (!IS_FREEBUFF) return
  const current = activeRefreshHandle?.getSession() ?? null
  if (
    !current ||
    (current.status !== 'queued' &&
      current.status !== 'active' &&
      current.status !== 'draining')
  ) {
    return
  }
  const { token } = getAuthTokenDetails()
  if (!token) return
  try {
    await callSession('DELETE', token)
  } catch {
    // swallow — we're exiting
  }
}

/** Read the current instance id for outgoing chat requests. Includes
 *  `draining` so in-flight agent work can keep streaming during the
 *  server-side grace window. */
export function getFreebuffInstanceId(): string | undefined {
  const current = activeRefreshHandle?.getSession() ?? null
  if (!current) return undefined
  if (
    current.status === 'queued' ||
    current.status === 'active' ||
    current.status === 'draining'
  ) {
    return current.instanceId
  }
  return undefined
}

/**
 * Manages the freebuff waiting-room session lifecycle:
 *   - POST on mount to join the queue / rotate instance id
 *   - polls GET while queued (fast) or active (slow) to keep state fresh
 *   - re-POSTs when the server reports we have no row (`status: 'none'`)
 *   - DELETE on unmount so the slot frees up for the next user
 *   - plays a bell on transition from queued → active
 *
 * In non-freebuff builds the hook seeds `{ status: 'disabled' }` and exits.
 */
export function useFreebuffSession(): UseFreebuffSessionResult {
  const [session, setSession] = useState<FreebuffSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    let controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    let previousStatus: FreebuffSessionResponse['status'] | null = null
    let currentSession: FreebuffSessionResponse | null = null

    const applySession = (next: FreebuffSessionResponse) => {
      currentSession = next
      setSession(next)
      setError(null)
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

    const tick = async (opts: { forcePost?: boolean } = {}) => {
      if (cancelled) return
      const method = opts.forcePost ? 'POST' : nextMethod(currentSession)
      try {
        const next = await callSession(method, token, controller.signal)
        if (cancelled) return
        if (previousStatus === 'queued' && next.status === 'active') {
          playAdmissionSound()
        }

        // active/draining → none means we've passed the server's hard
        // cutoff. Flip to the client-only `ended` state instead of following
        // the usual 'none' re-POST path, so the chat surface stays mounted
        // and the user gets a gentle Enter-to-rejoin prompt rather than a
        // sudden yank into the waiting room. The normal drain path goes
        // active → draining → ended; the `active → none` branch covers the
        // edge case where a poll misses draining entirely.
        if (
          (previousStatus === 'active' || previousStatus === 'draining') &&
          next.status === 'none'
        ) {
          previousStatus = 'ended'
          applySession({ status: 'ended' })
          return
        }

        previousStatus = next.status
        applySession(next)
        const delay = nextDelayMs(next)
        if (delay !== null) schedule(delay)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn({ error: msg }, '[freebuff-session] fetch failed')
        setError(msg)
        schedule(POLL_INTERVAL_ERROR_MS)
      }
    }

    tick()

    activeRefreshHandle = {
      refresh: async (opts) => {
        clearTimer()
        // Abort any in-flight fetch so it can't race us and overwrite state.
        controller.abort()
        controller = new AbortController()
        if (opts?.forcePost) {
          // Reset previousStatus so the queued→active bell still fires after a
          // forced re-POST (we're intentionally leaving any stale active state
          // behind — we know the seat is gone).
          previousStatus = null
        }
        await tick(opts)
      },
      markSuperseded: () => {
        clearTimer()
        controller.abort()
        previousStatus = 'superseded'
        applySession({ status: 'superseded' })
      },
      markEnded: () => {
        clearTimer()
        controller.abort()
        previousStatus = 'ended'
        applySession({ status: 'ended' })
      },
      getSession: () => currentSession,
    }

    return () => {
      cancelled = true
      controller.abort()
      clearTimer()
      activeRefreshHandle = null

      // Fire-and-forget DELETE. Only release if we actually held a slot so we
      // don't generate spurious DELETEs (e.g. HMR before POST completes).
      if (
        currentSession &&
        (currentSession.status === 'queued' ||
          currentSession.status === 'active' ||
          currentSession.status === 'draining')
      ) {
        callSession('DELETE', token).catch(() => {})
      }
      currentSession = null
      setSession(null)
      setError(null)
    }
  }, [])

  return { session, error }
}
