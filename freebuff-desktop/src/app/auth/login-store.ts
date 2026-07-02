/**
 * Persisted Freebuff identity for the desktop app.
 *
 * The desktop talks to the Freebuff API (chat-completions + /freebuff/session)
 * as a real logged-in user. That requires the user's auth token (their API key
 * / authToken), obtained via the device-code login flow (see login-flow.ts) and
 * persisted in the desktop state file (project-dir.ts), exactly like the CLI's
 * saved credentials.
 *
 * Sign-ins are HOST-SCOPED and stored per host (project-dir `authSessions`):
 * the state file is shared across launches while API_HOST is per-launch —
 * repo/dev launches default to the local dev stack — so a prod session and a
 * dev session must coexist. A token for another host is simply invisible here:
 * not sent, not cleared by a 401, not overwritten by signing in to this host.
 *
 * For local dev convenience, when no sign-in exists for this host we fall back
 * to the `CODEBUFF_API_KEY` env var so an unauthenticated dev build still works.
 */

import { API_HOST } from '../api-host'
import { clearAuth, readAuth, writeAuth, type DesktopAuthUser } from '../project-dir'

export type { DesktopAuthUser } from '../project-dir'

/** This host's persisted sign-in + the derived authed flag, in ONE state-file
 *  read. Prefer this over separate getAuthToken()/isAuthed()/getAuthUser()
 *  calls when you need more than one of them (e.g. per snapshot). */
export function getAuth(): { token?: string; user?: DesktopAuthUser; authed: boolean } {
  const entry = readAuth(API_HOST)
  return { token: entry?.token, user: entry?.user, authed: Boolean(entry?.token) }
}

/** The bearer token the desktop sends to the Freebuff API. This host's
 *  persisted sign-in first, then the dev env key. Undefined → not signed in
 *  to this host and no dev key. */
export function getAuthToken(): string | undefined {
  return readAuth(API_HOST)?.token ?? process.env.CODEBUFF_API_KEY ?? undefined
}

/** The logged-in user summary, if signed in via the login flow to THIS host. */
export function getAuthUser(): DesktopAuthUser | undefined {
  return readAuth(API_HOST)?.user
}

/** True when the user signed in through the login flow against this API host
 *  (a real persisted token, not just the dev env key). The picker / LoginGate
 *  key off this. */
export function isAuthed(): boolean {
  return Boolean(readAuth(API_HOST)?.token)
}

/** Persist a freshly-obtained token + user (called by the login flow) under
 *  the API host that issued it. Other hosts' sessions are untouched. */
export function saveAuth(token: string, user: DesktopAuthUser): void {
  writeAuth(API_HOST, { token, user })
}

/** Clear THIS host's persisted credentials (logout / revoked token). */
export function logout(): void {
  clearAuth(API_HOST)
}
