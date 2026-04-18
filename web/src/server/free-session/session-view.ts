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
  maxConcurrent: number
  sessionLengthMs: number
  now: Date
}): SessionStateResponse | null {
  const { row, position, queueDepth, maxConcurrent, sessionLengthMs, now } = params
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
        maxConcurrent,
        sessionLengthMs,
      }),
      queuedAt: row.queued_at.toISOString(),
    }
  }

  // expired active — callers should treat as "no session" and re-queue
  return null
}

/**
 * Upper-bound estimate: assumes full capacity and uniform session expiry.
 * Real wait time is usually lower because sessions finish early.
 *
 *   waitMs ≈ floor((position - 1) / maxConcurrent) * sessionLengthMs
 *
 * Position 1..maxConcurrent → 0ms (next admission tick will pick you up).
 * Position maxConcurrent+1..2*maxConcurrent → one full session length.
 */
export function estimateWaitMs(params: {
  position: number
  maxConcurrent: number
  sessionLengthMs: number
}): number {
  const { position, maxConcurrent, sessionLengthMs } = params
  if (position <= 0 || maxConcurrent <= 0) return 0
  const waves = Math.floor((position - 1) / maxConcurrent)
  return waves * sessionLengthMs
}
