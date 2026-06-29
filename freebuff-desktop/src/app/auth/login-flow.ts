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
 * Kept dependency-light (plain fetch) so the desktop doesn't pull in the CLI's
 * React/analytics-coupled modules.
 */

import { saveAuth, type DesktopAuthUser } from './login-store'

const POLL_INTERVAL_MS = 2_000

function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
  ).replace(/\/$/, '')
}

interface PendingLogin {
  fingerprintId: string
  fingerprintHash: string
  expiresAt: string
  loginUrl: string
}

interface LoginCodeResponse {
  loginUrl: string
  fingerprintHash: string
  expiresAt: string
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
   *  open. Polling for completion runs in the background. */
  async start(): Promise<{ loginUrl: string; expiresAt: string }> {
    const fingerprintId = crypto.randomUUID()
    const res = await fetch(`${apiBaseUrl()}/api/auth/cli/code`, {
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

  private async poll(): Promise<void> {
    if (this.polling || !this.pending) return
    this.polling = true
    const pending = this.pending
    try {
      const deadline = Date.parse(pending.expiresAt) || Date.now() + 10 * 60_000
      while (this.pending === pending && Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        let user: LoginStatusResponse['user']
        try {
          const url = new URL(`${apiBaseUrl()}/api/auth/cli/status`)
          url.searchParams.set('fingerprintId', pending.fingerprintId)
          url.searchParams.set('fingerprintHash', pending.fingerprintHash)
          url.searchParams.set('expiresAt', pending.expiresAt)
          const res = await fetch(url, { method: 'GET' })
          if (res.ok) {
            user = ((await res.json()) as LoginStatusResponse).user
          }
        } catch {
          // Transient network error — keep polling until the deadline.
        }
        if (user?.authToken) {
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
      // Expired without completing — drop the attempt so the user can retry.
      if (this.pending === pending) this.pending = null
    } finally {
      this.polling = false
    }
  }
}
