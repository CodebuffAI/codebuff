/**
 * Freebuff device-code login for the desktop, ported from the CLI flow
 * (cli/src/login/login-flow.ts + cli/src/utils/codebuff-api.ts):
 *
 *   1. POST /api/auth/cli/code { fingerprintId }
 *        → { loginUrl, fingerprintHash, expiresAt }
 *   2. User opens `loginUrl` in a browser and signs in.
 *   3. Poll GET /api/auth/cli/status?fingerprintId&fingerprintHash&expiresAt
 *        → { user } once the browser side completes; `user.authToken` is the
 *          bearer we persist and send to the Freebuff API.
 *
 * The whole device-code exchange runs against AUTH_HOST (freebuff.com in
 * prod), so the browser sign-in is Freebuff-branded — mirroring the CLI's
 * LOGIN_WEBSITE_URL split. The resulting token is stored under and used
 * against API_HOST (see login-store.ts); the two hosts share the DB.
 *
 * Kept dependency-light (plain fetch) so the desktop doesn't pull in the CLI's
 * React/analytics-coupled modules.
 */

import { AUTH_HOST } from '../api-host'
import { saveAuth, type DesktopAuthUser } from './login-store'

const POLL_INTERVAL_MS = 2_000

interface PendingLogin {
  fingerprintId: string
  fingerprintHash: string
  // The web `/api/auth/cli/code` endpoint returns this as a number (epoch ms).
  expiresAt: number | string
  loginUrl: string
}

interface LoginCodeResponse {
  loginUrl: string
  fingerprintHash: string
  // Epoch milliseconds (number), though older/proxied responses may stringify it.
  expiresAt: number | string
}

interface LoginStatusResponse {
  user?: {
    id?: string
    email?: string
    name?: string | null
    authToken?: string
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Drives one login attempt at a time and persists the result. The server wires
 * `onAuthenticated` so it can rebuild the Codebuff client with the new token and
 * refresh the access tier once sign-in completes.
 */
export class LoginManager {
  private pending: PendingLogin | null = null
  private polling = false

  constructor(private readonly onAuthenticated?: (user: DesktopAuthUser) => void) {}

  /** Begin a login attempt: request a code and return the URL for the user to
   *  open. Polling for completion runs in the background.
   *
   *  A retry while an attempt is still live returns the SAME pending code
   *  instead of minting a fresh one — otherwise each retry click would open a
   *  new tab with a new code and silently invalidate the older tabs, so
   *  completing any tab but the newest would never be picked up. A fresh code
   *  is minted only when there's no attempt or it's about to expire. */
  async start(): Promise<{ loginUrl: string; expiresAt: number | string }> {
    const existing = this.pending
    if (existing) {
      const expMs = Number(existing.expiresAt)
      if (!Number.isFinite(expMs) || Date.now() < expMs - 60_000) {
        return { loginUrl: existing.loginUrl, expiresAt: existing.expiresAt }
      }
    }
    const fingerprintId = crypto.randomUUID()
    const res = await fetch(`${AUTH_HOST}/api/auth/cli/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprintId }),
    })
    if (!res.ok) {
      throw new Error(`login code request failed (${res.status})`)
    }
    const data = (await res.json()) as LoginCodeResponse
    if (!data?.loginUrl) throw new Error('login code response missing loginUrl')
    this.pending = {
      fingerprintId,
      fingerprintHash: data.fingerprintHash,
      expiresAt: data.expiresAt,
      loginUrl: data.loginUrl,
    }
    void this.poll()
    return { loginUrl: data.loginUrl, expiresAt: data.expiresAt }
  }

  /** Whether a login attempt is currently waiting for the user. */
  isPending(): boolean {
    return this.pending !== null
  }

  /** Expiry of the pending attempt (epoch ms as returned by the server), or
   *  null when nothing is pending. Lets the UI rehydrate its waiting state. */
  pendingExpiresAt(): number | string | null {
    return this.pending?.expiresAt ?? null
  }

  /** Abandon the current attempt (user hit cancel in the UI). The poll loop
   *  notices `pending` changed and winds down; a completed browser sign-in for
   *  the dropped code is simply never picked up. */
  cancel(): void {
    this.pending = null
  }

  private async poll(): Promise<void> {
    // Only one poll loop runs at a time. It always polls the *current*
    // `this.pending`, so if `start()` is called again while we're running (a
    // renderer reload mid-flight, or a retry after timeout), the outer loop
    // picks up the replacement instead of stranding it unpolled.
    if (this.polling) return
    this.polling = true
    try {
      while (this.pending) {
        const pending = this.pending
        // `expiresAt` is epoch milliseconds (a number). Parse it numerically —
        // `Date.parse` on a numeric value returns NaN, which previously collapsed
        // the poll window from the server's 1 hour to the 10-minute fallback and
        // silently stranded slower sign-ins on "Waiting for sign-in…".
        const expiresAtMs = Number(pending.expiresAt)
        const deadline = Number.isFinite(expiresAtMs)
          ? expiresAtMs
          : Date.now() + 60 * 60_000
        while (this.pending === pending && Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS)
          let user: LoginStatusResponse['user']
          try {
            const url = new URL(`${AUTH_HOST}/api/auth/cli/status`)
            url.searchParams.set('fingerprintId', pending.fingerprintId)
            url.searchParams.set('fingerprintHash', pending.fingerprintHash)
            url.searchParams.set('expiresAt', String(pending.expiresAt))
            const res = await fetch(url, { method: 'GET' })
            if (res.ok) {
              user = ((await res.json()) as LoginStatusResponse).user
            }
          } catch {
            // Transient network error — keep polling until the deadline.
          }
          // Re-check identity after the awaits: cancel() or a replacing start()
          // may have dropped this attempt while the sleep/fetch was in flight —
          // completing a cancelled or superseded attempt must not sign us in
          // (nor abandon the replacement, which the outer loop picks up).
          if (user?.authToken && this.pending === pending) {
            const saved: DesktopAuthUser = {
              id: user.id,
              email: user.email,
              name: user.name ?? undefined,
            }
            saveAuth(user.authToken, saved)
            this.pending = null
            this.onAuthenticated?.(saved)
            return
          }
        }
        // This attempt expired without completing. Drop it (unless `start()`
        // already swapped in a newer one, which the outer loop will then poll).
        if (this.pending === pending) this.pending = null
      }
    } finally {
      this.polling = false
    }
  }
}
