/**
 * Sign-in affordance for the Freebuff (hosted) agent. The desktop runs the
 * hosted agent in free mode as a logged-in user, so when no token is persisted
 * we surface a "Sign in" pill in the thread header. Clicking starts the
 * device-code flow (server /api/auth/login/start), opens the login URL in the
 * system browser, and waits — the server broadcasts a fresh state event once the
 * browser side completes, which flips `freebuff.authed` and unmounts this gate.
 *
 * The button stays clickable while waiting: if the browser step goes sideways
 * (tab closed, login page never loaded), another click re-opens the pending
 * attempt's login URL (LoginManager.start() reuses a still-valid code). A ✕
 * beside it cancels outright. On mount we rehydrate from /api/auth/status, so
 * a renderer reload mid-wait comes back in the waiting state instead of
 * pretending nothing is in flight.
 */

import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import { Icon } from './Icon'

export function LoginGate() {
  const pushToast = useStore((s) => s.pushToast)
  // idle → starting (a request is in flight; button disabled) → waiting
  // (browser step pending).
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting'>('idle')
  // Last-resort reset if sign-in never completes: when the auth code expires
  // (~1h) drop back to idle with a toast. On success the server broadcasts a
  // fresh state event that flips `authed` and unmounts this gate (clearing the
  // timer below); only the abandoned path lands here. Recovery doesn't depend
  // on this — the button stays clickable throughout.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function armExpiryTimer(expiresAt: number | string | null | undefined) {
    // The server's auth code lives ~1h; cap the wait a little under that,
    // falling back to 1h if `expiresAt` is missing/odd.
    const expiresAtMs = Number(expiresAt)
    const waitMs = Number.isFinite(expiresAtMs)
      ? Math.max(60_000, expiresAtMs - Date.now())
      : 60 * 60_000
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setPhase('idle')
      pushToast('Sign-in timed out — please try again.', 'error')
    }, waitMs)
  }

  // Rehydrate: the server keeps polling a pending attempt across renderer
  // reloads, so pick its waiting state (and the cancel affordance) back up.
  useEffect(() => {
    let alive = true
    void api
      .authStatus()
      .then((s) => {
        if (!alive || !s.loginPending) return
        setPhase('waiting')
        armExpiryTimer(s.loginExpiresAt)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function start() {
    const prevPhase = phase
    // Drop any armed timer up front so a failed retry can't leave the previous
    // attempt's timer firing a spurious "timed out" toast later.
    if (timer.current) clearTimeout(timer.current)
    setPhase('starting')
    try {
      const res = await api.startLogin()
      if (!res.ok || !res.loginUrl) {
        pushToast(res.error ?? 'Could not start sign-in.', 'error')
        // A failed retry doesn't kill the server-side attempt — stay in
        // 'waiting' so the cancel affordance remains reachable.
        setPhase(prevPhase === 'waiting' ? 'waiting' : 'idle')
        return
      }
      // Electron routes external URLs to the system browser via its
      // window-open handler; in a plain browser this just opens a tab.
      window.open(res.loginUrl, '_blank')
      setPhase('waiting')
      armExpiryTimer(res.expiresAt)
    } catch (err) {
      pushToast((err as Error).message, 'error')
      setPhase(prevPhase === 'waiting' ? 'waiting' : 'idle')
    }
  }

  async function cancel() {
    if (timer.current) clearTimeout(timer.current)
    // Hold the button disabled until the cancel settles so a quick
    // cancel-then-retry can't interleave the two requests server-side.
    setPhase('starting')
    try {
      await api.cancelLogin()
    } catch {
      // The stray poll just runs out at the code's expiry; nothing to surface.
    }
    setPhase('idle')
  }

  return (
    <>
      <button
        className="head-btn"
        onClick={start}
        disabled={phase === 'starting'}
        title={
          phase === 'waiting'
            ? 'Finish signing in from the browser tab we opened — or click to open it again'
            : 'Sign in to use the Freebuff hosted agent'
        }
      >
        <Icon name="dot" />{' '}
        {phase === 'waiting' ? 'Waiting for sign-in… (retry)' : 'Sign in to Freebuff'}
      </button>
      {phase === 'waiting' && (
        <button className="head-btn" onClick={cancel} title="Cancel sign-in" aria-label="Cancel sign-in">
          <Icon name="x" />
        </button>
      )}
    </>
  )
}
