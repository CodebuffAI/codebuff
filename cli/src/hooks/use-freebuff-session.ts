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
 * Normalize a server response into CLI internal state. The only transform is
 * `draining → ended` with the instance id preserved — see
 * `types/freebuff-session.ts` for the rationale.
 */
function toClientSession(
  resp: FreebuffSessionServerResponse,
): FreebuffSessionResponse {
  if (resp.status === 'draining') {
    return { status: 'ended', instanceId: resp.instanceId }
  }
  return resp
}

/** Picks the poll delay after a successful tick. */
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
    case 'none':
    case 'disabled':
    case 'superseded':
    case 'ended':
      return null
  }
}

/**
 * Imperatively re-sync the session with the server. Call this when the
 * chat-completions gate tells us our seat is no longer valid (428, 410).
 */
export async function refreshFreebuffSession(): Promise<void> {
  if (!IS_FREEBUFF) return
  await useFreebuffSessionStore.getState().driver?.refresh({ forcePost: true })
}

/**
 * Rejoin the waiting room after a session has ended. Wipes any prior chat
 * history so the next admitted session starts fresh (callers shouldn't have
 * to remember this detail).
 */
export async function rejoinFreebuffSession(): Promise<void> {
  if (!IS_FREEBUFF) return
  await useFreebuffSessionStore.getState().driver?.refresh({ forcePost: true })
  const { useChatStore } = await import('../state/chat-store')
  useChatStore.getState().reset()
}

/**
 * Flip into the terminal `superseded` state (stops polling, renders the
 * "close the other CLI" screen). Called after a 409 session_superseded.
 */
export function markFreebuffSessionSuperseded(): void {
  if (!IS_FREEBUFF) return
  useFreebuffSessionStore.getState().driver?.markSuperseded()
}

/**
 * Flip into the client-only `ended` state (hides the input, shows the
 * rejoin banner). Called both when a poll detects `active → none` and when
 * the chat gate returns 410/428. In-flight agent work may still finish
 * under the server-side grace period.
 */
export function markFreebuffSessionEnded(): void {
  if (!IS_FREEBUFF) return
  useFreebuffSessionStore.getState().driver?.markEnded()
}

/**
 * Best-effort DELETE of the caller's session row. Used by exit paths that
 * skip React unmount (process.exit on Ctrl+C) so the seat frees up quickly
 * instead of waiting for the server-side expiry sweep.
 */
export async function endFreebuffSessionBestEffort(): Promise<void> {
  if (!IS_FREEBUFF) return
  const current = useFreebuffSessionStore.getState().session
  if (
    !current ||
    (current.status !== 'queued' &&
      current.status !== 'active' &&
      current.status !== 'ended')
  ) {
    return
  }
  // `ended` without an instanceId means the server already dropped our row;
  // skip the DELETE.
  if (current.status === 'ended' && !current.instanceId) return
  const { token } = getAuthTokenDetails()
  if (!token) return
  try {
    await callSession('DELETE', token)
  } catch {
    // swallow — we're exiting
  }
}

/** Read the current instance id for outgoing chat requests. Includes `ended`
 *  so in-flight agent work can keep streaming during the server-side grace
 *  window. */
export function getFreebuffInstanceId(): string | undefined {
  const current = useFreebuffSessionStore.getState().session
  if (!current) return undefined
  switch (current.status) {
    case 'queued':
    case 'active':
      return current.instanceId
    case 'ended':
      return current.instanceId
    default:
      return undefined
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
 *
 * Writes all state into `useFreebuffSessionStore`; components subscribe
 * there rather than reading the return value. The return value is kept for
 * back-compat with AuthedSurface's render gate.
 */
export function useFreebuffSession(): UseFreebuffSessionResult {
  const session = useFreebuffSessionStore((s) => s.session)
  const error = useFreebuffSessionStore((s) => s.error)

  useEffect(() => {
    const { setSession, setError, setDriver } =
      useFreebuffSessionStore.getState()

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
    let hasPosted = false

    const apply = (next: FreebuffSessionResponse) => {
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
      // POST only when we don't yet hold a seat; thereafter GET. The
      // `active → none` edge is short-circuited to `ended` below, so we
      // never GET our way back into a needs-POST state without an explicit
      // force.
      const method: 'POST' | 'GET' =
        opts.forcePost || !hasPosted ? 'POST' : 'GET'
      try {
        const raw = await callSession(method, token, controller.signal)
        if (cancelled) return
        hasPosted = true
        const next = toClientSession(raw)

        if (previousStatus === 'queued' && next.status === 'active') {
          playAdmissionSound()
        }

        // active/ended → none means we've passed the server's hard cutoff.
        // Flip to the client-only `ended` state instead of following the
        // usual 'none' re-POST path, so the chat surface stays mounted and
        // the user gets a gentle Enter-to-rejoin prompt.
        if (
          (previousStatus === 'active' || previousStatus === 'ended') &&
          next.status === 'none'
        ) {
          previousStatus = 'ended'
          apply({ status: 'ended' })
          return
        }

        previousStatus = next.status
        apply(next)
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

    setDriver({
      refresh: async (opts) => {
        clearTimer()
        // Abort any in-flight fetch so it can't race us and overwrite state.
        controller.abort()
        controller = new AbortController()
        if (opts?.forcePost) {
          // Reset previousStatus so the queued→active bell still fires after
          // a forced re-POST.
          previousStatus = null
          hasPosted = false
        }
        await tick(opts)
      },
      markSuperseded: () => {
        clearTimer()
        controller.abort()
        previousStatus = 'superseded'
        apply({ status: 'superseded' })
      },
      markEnded: () => {
        clearTimer()
        controller.abort()
        previousStatus = 'ended'
        apply({ status: 'ended' })
      },
    })

    return () => {
      cancelled = true
      controller.abort()
      clearTimer()
      const current = useFreebuffSessionStore.getState().session
      setDriver(null)

      // Fire-and-forget DELETE. Only release if we actually held a slot so
      // we don't generate spurious DELETEs (e.g. HMR before POST completes).
      if (
        current &&
        (current.status === 'queued' ||
          current.status === 'active' ||
          (current.status === 'ended' && current.instanceId))
      ) {
        callSession('DELETE', token).catch(() => {})
      }
      setSession(null)
      setError(null)
    }
  }, [])

  return { session, error }
}
