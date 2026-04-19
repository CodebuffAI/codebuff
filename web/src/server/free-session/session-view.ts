import type { InternalSessionRow, SessionStateResponse } from './types'

/**
 * Pure function converting an internal session row (or absence thereof) into
 * the public response shape. Never reads the clock — caller supplies `now` so
 * behavior is deterministic under test.
 *
 * Returns null only when the row is past the grace window — the caller
 * should treat that as "no session" and either re-queue or surface
 * `{ status: 'none' }` to the client.
 */
export function toSessionStateResponse(params: {
  row: InternalSessionRow | null
  position: number
  queueDepth: number
  admissionTickMs: number
  graceMs: number
  now: Date
}): SessionStateResponse | null {
  const { row, position, queueDepth, admissionTickMs, graceMs, now } = params
  if (!row) return null

  if (row.status === 'active' && row.expires_at) {
    const expiresAtMs = row.expires_at.getTime()
    const nowMs = now.getTime()
    if (expiresAtMs > nowMs) {
      return {
        status: 'active',
        instanceId: row.active_instance_id,
        admittedAt: (row.admitted_at ?? row.created_at).toISOString(),
        expiresAt: row.expires_at.toISOString(),
        remainingMs: expiresAtMs - nowMs,
      }
    }
    const graceEndsMs = expiresAtMs + graceMs
    if (graceEndsMs > nowMs) {
      return {
        status: 'ended',
        instanceId: row.active_instance_id,
        admittedAt: (row.admitted_at ?? row.created_at).toISOString(),
        expiresAt: row.expires_at.toISOString(),
        gracePeriodEndsAt: new Date(graceEndsMs).toISOString(),
        gracePeriodRemainingMs: graceEndsMs - nowMs,
      }
    }
  }

  if (row.status === 'queued') {
    return {
      status: 'queued',
      instanceId: row.active_instance_id,
      position,
      queueDepth,
      estimatedWaitMs: estimateWaitMs({ position, admissionTickMs }),
      queuedAt: row.queued_at.toISOString(),
    }
  }

  // active row past the grace window — callers should treat as "no session" and re-queue
  return null
}

/**
 * Wait-time estimate under the drip-admission model: one user per
 * `admissionTickMs`, gated by Fireworks health. Ignoring health pauses, the
 * user at position P waits roughly `(P - 1) * admissionTickMs`.
 *
 * Position 1 → 0ms (next tick picks you up).
 */
export function estimateWaitMs(params: {
  position: number
  admissionTickMs: number
}): number {
  const { position, admissionTickMs } = params
  if (position <= 1 || admissionTickMs <= 0) return 0
  return (position - 1) * admissionTickMs
}
