/**
 * Persisted Freebuff identity for the desktop app.
 *
 * The desktop talks to the Freebuff API (chat-completions + /freebuff/session)
 * as a real logged-in user. That requires the user's auth token (their API key
 * / authToken), obtained via the device-code login flow (see login-flow.ts) and
 * persisted in the desktop state file (project-dir.ts), exactly like the CLI's
 * saved credentials.
 *
 * For local dev convenience, when no token is persisted we fall back to the
 * `CODEBUFF_API_KEY` env var so an unauthenticated dev build still works.
 */

import {
  clearAuth,
  readAuthToken,
  readAuthUser,
  writeAuthToken,
  writeAuthUser,
  type DesktopAuthUser,
} from '../project-dir'

export type { DesktopAuthUser } from '../project-dir'

/** The bearer token the desktop sends to the Freebuff API. Persisted token
 *  first, then the dev env key. Undefined → not signed in and no dev key. */
export function getAuthToken(): string | undefined {
  return readAuthToken() ?? process.env.CODEBUFF_API_KEY ?? undefined
}

/** The logged-in user summary, if signed in via the login flow. */
export function getAuthUser(): DesktopAuthUser | undefined {
  return readAuthUser()
}

/** True when the user signed in through the login flow (a real persisted token,
 *  not just the dev env key). The picker / LoginGate keys off this. */
export function isAuthed(): boolean {
  return Boolean(readAuthToken())
}

/** Persist a freshly-obtained token + user (called by the login flow). */
export function saveAuth(token: string, user: DesktopAuthUser): void {
  writeAuthToken(token)
  writeAuthUser(user)
}

/** Clear persisted credentials (logout). */
export function logout(): void {
  clearAuth()
}
