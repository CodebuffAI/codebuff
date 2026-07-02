/**
 * The one Freebuff web API origin this app talks to — login, free-mode
 * sessions, log shipping. The SDK resolves the same env var at module load
 * (via @codebuff/common/env), so every consumer agrees.
 *
 * Launched from the repo (`bun run app` / `dev` / `dev:web`), the direnv bun
 * wrapper injects .env.local, so this is the LOCAL dev stack
 * (http://localhost:3000) — start the web app or sign-in and turns will fail.
 * A non-prod host is surfaced as a yellow `API: …` badge in the thread header
 * so that's visible instead of a silent surprise. Shell env beats the
 * wrapper's --env-file, so prod from a repo launch is
 * `NEXT_PUBLIC_CODEBUFF_APP_URL=https://www.codebuff.com bun run app`.
 * Packaged builds bake the prod value in at bundle time
 * (scripts/build-orchestrator.ts).
 *
 * We default to the canonical www host: the apex `codebuff.com`
 * 301/307-redirects every request to `www.codebuff.com`, so hitting the apex
 * adds a redirect round-trip to every poll (see scripts/smoke-sdk.ts).
 */

export const PROD_API_HOST = 'https://www.codebuff.com'

/** One canonical spelling per origin (lowercased scheme+host, no path/slash),
 *  so host-scoped auth (login-store) can compare hosts by string equality —
 *  `HTTP://LOCALHOST:3000/` and `http://localhost:3000` are the same sign-in. */
function canonicalizeHost(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}`
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

export const API_HOST = canonicalizeHost(process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || PROD_API_HOST)

if (API_HOST !== PROD_API_HOST) {
  console.log(`Freebuff API host: ${API_HOST} (non-default)`)
}
