/**
 * Loopback-origin guard for the local orchestrator's `/api` surface.
 *
 * Binding to 127.0.0.1 is NOT a security boundary on its own: any web page the
 * user visits can fire `fetch('http://127.0.0.1:<port>/api/run', {method:'POST',
 * …})`, and that request EXECUTES server-side — the browser blocks reading the
 * response under CORS, but the side effect already happened. Since `/api/run`
 * runs shell commands in the open repo, that's a local RCE via CSRF. A forged
 * `Host` header (DNS rebinding) doesn't help the attacker either: the browser
 * still stamps the real attacker `Origin` on the request.
 *
 * Defense: reject any `/api` request whose `Origin` header is present and is NOT
 * a loopback origin. Same-origin requests from the renderer pass (their Origin is
 * the loopback server), the dev Vite proxy passes (it forwards a localhost
 * Origin), and non-browser clients that omit `Origin` (curl, the Electron main
 * process) pass — they aren't the CSRF threat.
 */

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1'])

/** Whether a URL hostname is loopback. Strips IPv6 brackets (`[::1]` → `::1`). */
export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return LOOPBACK_HOSTNAMES.has(h)
}

/**
 * Whether a request bearing this `Origin` header may reach the `/api` surface.
 * `null`/absent Origin → allowed (same-origin navigations and non-browser clients
 * omit it; they carry no cross-site CSRF vector). A present Origin must resolve to
 * a loopback host; anything else (incl. an unparseable value) is rejected.
 */
export function isAllowedApiOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true
  try {
    return isLoopbackHostname(new URL(origin).hostname)
  } catch {
    return false
  }
}
