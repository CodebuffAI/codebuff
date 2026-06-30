/**
 * Sign-in affordance for the Freebuff (hosted) agent. The desktop runs the
 * hosted agent in free mode as a logged-in user, so when no token is persisted
 * we surface a "Sign in" pill in the thread header. Clicking starts the
 * device-code flow (server /api/auth/login/start), opens the login URL in the
 * system browser, and waits — the server broadcasts a fresh state event once the
 * browser side completes, which flips `freebuff.authed` and unmounts this gate.
 */

import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import { Icon } from './Icon'

export function LoginGate() {
  const pushToast = useStore((s) => s.pushToast)
  const [waiting, setWaiting] = useState(false)
  // Reset the button if sign-in never completes, so the user isn't stranded on
  // "Waiting for sign-in…" with no way to retry. On success the server
  // broadcasts a fresh state event that flips `authed` and unmounts this gate
  // (clearing the timer below); only the timeout/abandoned path lands here.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function start() {
    setWaiting(true)
    try {
      const res = await api.startLogin()
      if (!res.ok || !res.loginUrl) {
        pushToast(res.error ?? 'Could not start sign-in.', 'error')
        setWaiting(false)
        return
      }
      // Electron routes external URLs to the system browser via its
      // window-open handler; in a plain browser this just opens a tab.
      window.open(res.loginUrl, '_blank')
      // Arm a fallback so the gate recovers if the user never finishes (or the
      // code expires). The server's auth code lives ~1h; cap the wait a little
      // under that, falling back to 1h if `expiresAt` is missing/odd.
      const expiresAtMs = Number(res.expiresAt)
      const waitMs = Number.isFinite(expiresAtMs)
        ? Math.max(60_000, expiresAtMs - Date.now())
        : 60 * 60_000
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setWaiting(false)
        pushToast('Sign-in timed out — please try again.', 'error')
      }, waitMs)
    } catch (err) {
      pushToast((err as Error).message, 'error')
      setWaiting(false)
    }
  }

  return (
    <button
      className="head-btn"
      onClick={start}
      disabled={waiting}
      title="Sign in to use the Freebuff hosted agent"
    >
      <Icon name="dot" /> {waiting ? 'Waiting for sign-in…' : 'Sign in to Freebuff'}
    </button>
  )
}
