/**
 * The one way the renderer starts a Freebuff device-code sign-in: POST the
 * login-start route, then open the returned URL (Electron's window-open
 * handler routes it to the system browser; a plain browser opens a tab).
 * Driven through the store's shared login slice (StoreState.startLogin), so
 * every sign-in surface — the tab bar's LoginGate, the welcome CTA, the
 * freebuff-auth NoticeCard action — runs the one flow and can't drift.
 * Completion is out-of-band either way: the server polls the attempt and
 * broadcasts a state event that flips `authed`.
 *
 * Throws with a user-facing message when the attempt can't start; returns the
 * auth code's expiry for callers that arm a timeout. LoginManager.start()
 * reuses a still-valid pending code, so calling this again mid-attempt just
 * reopens the same login URL.
 */

import { api } from './api'

export async function startLoginInBrowser(): Promise<{
  expiresAt: number | string | undefined
}> {
  const res = await api.startLogin()
  if (!res.ok || !res.loginUrl) throw new Error(res.error ?? 'Could not start sign-in.')
  window.open(res.loginUrl, '_blank')
  return { expiresAt: res.expiresAt }
}
