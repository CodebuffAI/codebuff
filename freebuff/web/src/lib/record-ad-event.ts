/** Surface the ad event came from: the chat assistant or the app builder. */
export type AdEventSurface = 'chat' | 'web'

/** Reports the ad event server-side; for impressions the server fires
 * Gravity's pixel itself, so tracking works even with client ad blockers. */
export function recordAdEvent(
  event: 'impression' | 'click',
  impUrl: string,
  surface: AdEventSurface,
) {
  fetch(`/api/ads/${event}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ impUrl, surface }),
    keepalive: true,
  }).catch(() => {})
}
