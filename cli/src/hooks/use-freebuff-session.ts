import { env } from '@codebuff/common/env'
import { useEffect } from 'react'

import { useFreebuffSessionStore } from '../state/freebuff-session-store'
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
  if (current?.status === 'queued' || current?.status === 'active') return 'GET'
  return 'POST'
}

function nextDelayMs(next: FreebuffSessionResponse): number | null {
  switch (next.status) {
    case 'queued':
      return POLL_INTERVAL_QUEUED_MS
    case 'active':
      return POLL_INTERVAL_ACTIVE_MS
    case 'none':
      // Server lost our row / active session expired — POST again ASAP.
      return 0
    case 'disabled':
    case 'superseded':
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
}

/**
 * Module-level handle to the active hook's poll driver. Set by the hook's
 * effect on mount; cleared on unmount. Lets external callers (e.g. the
 * chat-completions gate-error handler) request an immediate re-POST without
 * re-plumbing a ref through the component tree.
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
 * Flip the store into a terminal `superseded` state. Polling stops and the
 * UI renders a dedicated "close the other CLI and restart" screen. Called
 * after a 409 session_superseded so we don't silently fight the other
 * instance for the seat.
 */
export function markFreebuffSessionSuperseded(): void {
  if (!IS_FREEBUFF) return
  activeRefreshHandle?.markSuperseded()
}

/**
 * Best-effort DELETE of the caller's session row. Used by exit paths that
 * skip React unmount (process.exit on Ctrl+C) so the seat frees up quickly
 * instead of waiting for the server-side expiry sweep. Swallows errors
 * because we are about to terminate anyway.
 */
export async function endFreebuffSessionBestEffort(): Promise<void> {
  if (!IS_FREEBUFF) return
  const current = useFreebuffSessionStore.getState().session
  if (!current || (current.status !== 'queued' && current.status !== 'active')) {
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
  const session = useFreebuffSessionStore((s) => s.session)
  const lastFetchError = useFreebuffSessionStore((s) => s.lastFetchError)

  useEffect(() => {
    if (!IS_FREEBUFF) {
      useFreebuffSessionStore.getState().setSession({ status: 'disabled' })
      return
    }

    const { token } = getAuthTokenDetails()
    if (!token) {
      logger.warn(
        {},
        '[freebuff-session] No auth token; skipping waiting-room admission',
      )
      useFreebuffSessionStore.getState().setError('Not authenticated')
      return
    }

    let cancelled = false
    let controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    let previousStatus: FreebuffSessionResponse['status'] | null = null

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
      const current = useFreebuffSessionStore.getState().session
      const method = opts.forcePost ? 'POST' : nextMethod(current)
      try {
        const next = await callSession(method, token, controller.signal)
        if (cancelled) return
        if (previousStatus === 'queued' && next.status === 'active') {
          playAdmissionSound()
        }
        previousStatus = next.status
        useFreebuffSessionStore.getState().setSession(next)
        const delay = nextDelayMs(next)
        if (delay !== null) schedule(delay)
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        const msg = error instanceof Error ? error.message : String(error)
        logger.warn({ error: msg }, '[freebuff-session] fetch failed')
        useFreebuffSessionStore.getState().setError(msg)
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
        useFreebuffSessionStore.getState().setSession({ status: 'superseded' })
      },
    }

    return () => {
      cancelled = true
      controller.abort()
      clearTimer()
      activeRefreshHandle = null

      // Fire-and-forget DELETE. Only release if we actually held a slot so we
      // don't generate spurious DELETEs (e.g. HMR before POST completes).
      const current = useFreebuffSessionStore.getState().session
      if (
        current &&
        (current.status === 'queued' || current.status === 'active')
      ) {
        callSession('DELETE', token).catch(() => {})
      }
      useFreebuffSessionStore.getState().reset()
    }
  }, [])

  return {
    session,
    error: lastFetchError,
  }
}
