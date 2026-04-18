import type { InternalSessionRow, SessionStateResponse } from './types'

/**
 * Pure function converting an internal session row (or absence thereof) into
 * the public response shape. Never reads the clock — caller supplies `now` so
 * behavior is deterministic under test.
 */
export function toSessionStateResponse(params: {
  row: InternalSessionRow | null
  position: number
  queueDepth: number
  admissionTickMs: number
  maxAdmitsPerTick: number
  now: Date
}): SessionStateResponse | null {
  const { row, position, queueDepth, admissionTickMs, maxAdmitsPerTick, now } = params
  if (!row) return null

  if (row.status === 'active' && row.expires_at && row.expires_at.getTime() > now.getTime()) {
    return {
      status: 'active',
      instanceId: row.active_instance_id,
      admittedAt: (row.admitted_at ?? row.created_at).toISOString(),
      expiresAt: row.expires_at.toISOString(),
      remainingMs: row.expires_at.getTime() - now.getTime(),
    }
  }

  if (row.status === 'queued') {
    return {
      status: 'queued',
      instanceId: row.active_instance_id,
      position,
      queueDepth,
      estimatedWaitMs: estimateWaitMs({
        position,
        admissionTickMs,
        maxAdmitsPerTick,
      }),
      queuedAt: row.queued_at.toISOString(),
    }
  }

  // expired active — callers should treat as "no session" and re-queue
  return null
}

/**
 * Wait-time estimate under the drip-admission model: we admit
 * `maxAdmitsPerTick` users every `admissionTickMs`, gated by Fireworks
 * health. Ignoring health pauses, user at position P waits roughly
 * `ceil((P - 1) / maxAdmitsPerTick) * admissionTickMs`.
 *
 * Position 1 → 0ms (next tick picks you up).
 * Position maxAdmitsPerTick+1 → one tick.
 */
export function estimateWaitMs(params: {
  position: number
  admissionTickMs: number
  maxAdmitsPerTick: number
}): number {
  const { position, admissionTickMs, maxAdmitsPerTick } = params
  if (position <= 1 || admissionTickMs <= 0 || maxAdmitsPerTick <= 0) return 0
  const ticksAhead = Math.ceil((position - 1) / maxAdmitsPerTick)
  return ticksAhead * admissionTickMs
}
