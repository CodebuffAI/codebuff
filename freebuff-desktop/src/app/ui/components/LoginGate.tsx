/**
 * Sign-in affordance for the Freebuff (hosted) agent. The desktop runs the
 * hosted agent in free mode as a logged-in user, so when no token is persisted
 * we surface a "Sign in" pill in the thread header. Clicking starts the
 * device-code flow (server /api/auth/login/start), opens the login URL in the
 * system browser, and waits — the server broadcasts a fresh state event once the
 * browser side completes, which flips `freebuff.authed` and unmounts this gate.
 */

import { useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import { Icon } from './Icon'

export function LoginGate() {
  const pushToast = useStore((s) => s.pushToast)
  const [waiting, setWaiting] = useState(false)

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
