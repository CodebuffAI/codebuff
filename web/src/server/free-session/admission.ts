import { EXPIRY_SWEEP_THROTTLE_MS, getSessionGraceMs } from './config'
import { sweepExpired } from './store'

import { logger } from '@/util/logger'

let lastOpportunisticSweepAt = 0
let opportunisticSweepInFlight = false

export function __resetFreeSessionAdmissionForTests(): void {
  lastOpportunisticSweepAt = 0
  opportunisticSweepInFlight = false
}

/**
 * Traffic-driven expiry sweep. Free sessions are admitted immediately on
 * request (no waiting room, no FIFO queue, no background admission tick), so
 * the only ongoing maintenance is deleting rows past their `expires_at + grace`
 * window. This runs that sweep off the request hot path, throttled to one sweep
 * per `EXPIRY_SWEEP_THROTTLE_MS` per instance and guarded against overlap.
 *
 * Best-effort and non-blocking: the caller `void`s it, and it never rejects.
 * `activeCountForModel` no longer gates admission, so an un-swept expired row
 * has no functional impact — this just keeps the table from growing unbounded.
 */
export async function maybeSweepExpired(deps?: {
  sweepExpired?: (now: Date, graceMs: number) => Promise<number>
  graceMs?: number
  now?: () => Date
}): Promise<void> {
  const sweep = deps?.sweepExpired ?? sweepExpired
  const graceMs = deps?.graceMs ?? getSessionGraceMs()
  const now = (deps?.now ?? (() => new Date()))()
  if (opportunisticSweepInFlight) return
  if (now.getTime() - lastOpportunisticSweepAt < EXPIRY_SWEEP_THROTTLE_MS)
    return
  opportunisticSweepInFlight = true
  lastOpportunisticSweepAt = now.getTime()
  try {
    const swept = await sweep(now, graceMs)
    if (swept > 0) {
      logger.info(
        { metric: 'freebuff_opportunistic_sweep', swept },
        '[FreeSession] opportunistic sweep removed expired sessions',
      )
    }
  } catch (error) {
    logger.error({ error }, '[FreeSession] opportunistic sweep failed')
  } finally {
    opportunisticSweepInFlight = false
  }
}
