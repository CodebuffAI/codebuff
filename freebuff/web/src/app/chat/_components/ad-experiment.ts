/**
 * Randomized experiment for the /chat sponsored slot: Gravity server-rendered
 * ads (layout delivered as a `renderer_spec` from the ad server, see
 * https://docs.trygravity.ai/sdks/server-rendered-ads) vs the existing
 * `@gravity-ai/react` inline unit.
 *
 * Bucketing is a deterministic hash of the signed-in user id, salted with the
 * experiment key, so a user lands in the same arm on every device and session
 * and future experiments re-randomize independently.
 */

export const CHAT_AD_EXPERIMENT = 'chat_ads_server_rendered_2026_07'

export type ChatAdVariant = 'server_rendered' | 'control'

/** FNV-1a 32-bit: tiny, dependency-free, stable across runtimes. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function chatAdVariantForUser(
  userId: string | null | undefined,
): ChatAdVariant {
  // /api/ads rejects unauthenticated requests, so with no user id the slot
  // never fills; keep those sessions in control so they stay out of the
  // server-rendered arm's metrics.
  if (!userId) return 'control'
  return fnv1a(`${CHAT_AD_EXPERIMENT}:${userId}`) % 2 === 0
    ? 'server_rendered'
    : 'control'
}
