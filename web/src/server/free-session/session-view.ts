import type { InternalSessionRow, SessionStateResponse } from './types'

function limitedModeReasonFromRow(row: InternalSessionRow) {
  if ((row.access_tier ?? 'full') !== 'limited') return {}
  return {
    countryCode: row.country_code ?? null,
    countryBlockReason: row.country_block_reason ?? null,
    ipPrivacySignals: row.ip_privacy_signals ?? null,
  }
}

/**
 * Pure function converting an internal session row (or absence thereof) into
 * the public response shape. Never reads the clock — caller supplies `now` so
 * behavior is deterministic under test.
 *
 * Returns null when the row is past the grace window, or when it is still
 * transiently `queued` (never surfaced to the wire — every session is admitted
 * immediately). The caller should treat null as "no session" and surface
 * `{ status: 'none' }` to the client.
 */
export function toSessionStateResponse(params: {
  row: InternalSessionRow | null
  graceMs: number
  now: Date
}): SessionStateResponse | null {
  const { row, graceMs, now } = params
  if (!row) return null

  if (row.status === 'active' && row.expires_at) {
    const expiresAtMs = row.expires_at.getTime()
    const nowMs = now.getTime()
    if (expiresAtMs > nowMs) {
      return {
        status: 'active',
        accessTier: row.access_tier ?? 'full',
        instanceId: row.active_instance_id,
        model: row.model,
        admittedAt: (row.admitted_at ?? row.created_at).toISOString(),
        expiresAt: row.expires_at.toISOString(),
        remainingMs: expiresAtMs - nowMs,
        ...limitedModeReasonFromRow(row),
      }
    }
    const graceEndsMs = expiresAtMs + graceMs
    if (graceEndsMs > nowMs) {
      return {
        status: 'ended',
        accessTier: row.access_tier ?? 'full',
        instanceId: row.active_instance_id,
        admittedAt: (row.admitted_at ?? row.created_at).toISOString(),
        expiresAt: row.expires_at.toISOString(),
        gracePeriodEndsAt: new Date(graceEndsMs).toISOString(),
        gracePeriodRemainingMs: graceEndsMs - nowMs,
        ...limitedModeReasonFromRow(row),
      }
    }
  }

  // Transient `queued` row, or an active row past the grace window — callers
  // should treat null as "no session".
  return null
}
