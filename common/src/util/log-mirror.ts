/**
 * Which analytics events get mirrored into the Axiom logs dataset.
 *
 * Axiom is the SQL-queryable copy for debugging/ops, where a handful of
 * extremely high-volume, low-query-value browser auto-events would otherwise
 * dominate ingest cost and bury the events we actually query (named product
 * events, signups, logins, errors).
 *
 * `$snapshot` (session replay) alone is the bulk of ingest. Autocapture,
 * heatmaps and web-vitals are similar noise in APL. Everything else —
 * `$pageview`, `$identify`, `$exception`, `$rageclick`, and all non-`$` named
 * events — is kept.
 */
export const AXIOM_MIRROR_DENYLIST: ReadonlySet<string> = new Set([
  '$snapshot',
  '$autocapture',
  '$heatmap',
  '$$heatmap',
  '$web_vitals',
  '$pageleave',
  // Engaged-time heartbeat: one event per user per minute across every surface.
  // High volume, low debug value, and PostHog is the system of record for the
  // metric — keep it out of the Axiom mirror to control ingest cost.
  'product_active_minute',
])

/** True if this analytics event should be copied into the Axiom logs dataset. */
export function shouldMirrorAnalyticsEvent(
  eventName: string | null | undefined,
): boolean {
  if (!eventName) return true
  return !AXIOM_MIRROR_DENYLIST.has(eventName)
}
