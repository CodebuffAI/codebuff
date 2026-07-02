/**
 * Sponsored ads for the desktop transcript, fetched from the Freebuff API's
 * unified ads endpoint (`/api/v1/ads` — Gravity, chat surfaces are
 * gravity-exclusive) with the same bearer the CLI uses.
 *
 * Unlike the CLI's rotating slot near the input box, the desktop intersperses
 * ads INTO the chat history (like freebuff.com/web): the ThreadEngine attaches
 * one as an `ad` part on a completed assistant turn, so it persists with the
 * message and stays in place as the user scrolls back. Impressions are NOT
 * recorded here at attach time — the renderer records them on first display
 * (via the server's /api/ad/impression proxy), so headless turns (queue
 * autorun with no window) never bill an impression nobody saw.
 *
 * The engine takes this as an injected `DesktopAds` (see EngineOptions.ads);
 * unwired engines (tests, standalone embedding) show no ads and touch no
 * network. Every method here is best-effort: no fill, no auth, or any network
 * error resolves to "no ad" / `false` rather than throwing into the turn path.
 */

import type { AdPayload } from '../core/parts'

import { API_HOST } from './api-host'
import { getAuthToken } from './auth/login-store'

/** Conversation context sent for ad targeting (roles + truncated text only). */
export interface AdContextMessage {
  role: string
  content: string
}

export interface DesktopAds {
  /** Cheap "could an ad fetch possibly succeed?" gate (token presence) so
   *  callers can skip building targeting context for a guaranteed null. */
  enabled(): boolean
  /** One ad for the given conversation context, or null (no fill / signed out /
   *  error). `signal` tears the request down early (e.g. the turn stopped). */
  fetchAd(ctx: {
    messages: AdContextMessage[]
    sessionId: string
    signal?: AbortSignal
  }): Promise<AdPayload | null>
  /** Record that an ad was actually displayed (grants any impression payout).
   *  True only when the upstream call succeeded. */
  recordImpression(impUrl: string): Promise<boolean>
  /** Record a click for analytics/payout (the renderer opens `clickUrl` itself).
   *  True only when the upstream call succeeded. */
  recordClick(impUrl: string): Promise<boolean>
}

/** How long we give the ads endpoint before giving up on a request. */
const AD_FETCH_TIMEOUT_MS = 10_000

/** os/timezone/locale never change for the process lifetime — compute once
 *  (Intl.DateTimeFormat construction is comparatively pricey). */
let deviceCached: { os: string; timezone: string; locale: string } | undefined
function deviceInfo() {
  if (!deviceCached) {
    const resolved = Intl.DateTimeFormat().resolvedOptions()
    deviceCached = {
      os: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
      timezone: resolved.timeZone,
      locale: resolved.locale,
    }
  }
  return deviceCached
}

/**
 * The real ads client. `getToken` is a thunk (not a captured value) so a
 * sign-in/out mid-session is picked up per request; no token → no ads, no
 * network.
 */
export function createDesktopAds(getToken: () => string | undefined = getAuthToken): DesktopAds {
  /** Best-effort authed POST: false on missing token, non-2xx, or any network
   *  error — shared by all three calls so the guard/swallow semantics can't
   *  drift between them. */
  const post = async (path: string, body: unknown, signal?: AbortSignal): Promise<Response | null> => {
    const token = getToken()
    if (!token) return null
    try {
      const timeout = AbortSignal.timeout(AD_FETCH_TIMEOUT_MS)
      return await fetch(`${API_HOST}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch {
      return null
    }
  }

  return {
    enabled: () => Boolean(getToken()),

    async fetchAd(ctx) {
      // No `surface`: like the CLI chat, omitting it takes the chat path
      // (gravity-exclusive, no fallback-network fill mid-conversation).
      const res = await post(
        '/api/v1/ads',
        { messages: ctx.messages, sessionId: ctx.sessionId, device: deviceInfo() },
        ctx.signal,
      )
      if (!res?.ok) return null
      try {
        const data = (await res.json()) as { ads?: AdPayload[] }
        const ad = data.ads?.[0]
        return ad && ad.title && ad.url ? ad : null
      } catch {
        return null
      }
    },

    async recordImpression(impUrl) {
      const res = await post('/api/v1/ads/impression', { impUrl, mode: 'desktop' })
      return Boolean(res?.ok)
    },

    async recordClick(impUrl) {
      const res = await post('/api/v1/ads/click', { impUrl })
      return Boolean(res?.ok)
    },
  }
}
