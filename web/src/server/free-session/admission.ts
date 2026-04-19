import {
  ADMISSION_TICK_MS,
  getSessionGraceMs,
  getSessionLengthMs,
  isWaitingRoomEnabled,
} from './config'
import { getFireworksHealth } from './fireworks-health'
import { activeCount, admitFromQueue, queueDepth, sweepExpired } from './store'

import type { FireworksHealth } from './fireworks-health'

import { logger } from '@/util/logger'

export interface AdmissionDeps {
  sweepExpired: (now: Date, graceMs: number) => Promise<number>
  queueDepth: () => Promise<number>
  activeCount: () => Promise<number>
  admitFromQueue: (params: {
    sessionLengthMs: number
    now: Date
    getFireworksHealth: () => Promise<FireworksHealth>
  }) => Promise<{ admitted: { user_id: string }[]; skipped: FireworksHealth | null }>
  getFireworksHealth: () => Promise<FireworksHealth>
  /** Plain values, not thunks — these never change at runtime. */
  sessionLengthMs: number
  graceMs: number
  now?: () => Date
}

const defaultDeps: AdmissionDeps = {
  sweepExpired,
  queueDepth,
  activeCount,
  admitFromQueue,
  // FREEBUFF_DEV_FORCE_ADMIT lets local `dev:freebuff` drive the full
  // waiting-room → admitted → ended flow without a real upstream.
  getFireworksHealth:
    process.env.FREEBUFF_DEV_FORCE_ADMIT === 'true'
      ? async () => 'healthy'
      : getFireworksHealth,
  get sessionLengthMs() {
    return getSessionLengthMs()
  },
  get graceMs() {
    return getSessionGraceMs()
  },
}

export interface AdmissionTickResult {
  expired: number
  admitted: number
  queueDepth: number
  activeCount: number
  skipped: FireworksHealth | null
}

/**
 * Run a single admission tick:
 *   1. Expire sessions past their expires_at + grace.
 *   2. Attempt to admit one queued user. Admission proceeds only when the
 *      upstream health probe reports `healthy`; `degraded` and `unhealthy`
 *      both pause admission so the deployment can catch up.
 *
 * Admission drips at (1 / ADMISSION_TICK_MS), which drives utilization up
 * slowly; once the probe stops returning `healthy`, step 2 halts admission
 * until the upstream recovers.
 *
 * Returns counts for observability. Safe to call concurrently across pods —
 * admitFromQueue takes an advisory xact lock.
 */
export async function runAdmissionTick(
  deps: AdmissionDeps = defaultDeps,
): Promise<AdmissionTickResult> {
  const now = (deps.now ?? (() => new Date()))()
  const expired = await deps.sweepExpired(now, deps.graceMs)

  const { admitted, skipped } = await deps.admitFromQueue({
    sessionLengthMs: deps.sessionLengthMs,
    now,
    getFireworksHealth: deps.getFireworksHealth,
  })

  const [depth, active] = await Promise.all([
    deps.queueDepth(),
    deps.activeCount(),
  ])
  return {
    expired,
    admitted: admitted.length,
    queueDepth: depth,
    activeCount: active,
    skipped,
  }
}

let interval: ReturnType<typeof setInterval> | null = null
let inFlight = false

function runTick() {
  if (inFlight) return
  inFlight = true
  runAdmissionTick()
    .then((result) => {
      // Emit every tick so queueDepth/activeCount form a continuous time-series
      // that can be charted over time. metric=freebuff_waiting_room makes it
      // filterable in the log aggregator.
      logger.info(
        {
          metric: 'freebuff_waiting_room',
          admitted: result.admitted,
          expired: result.expired,
          queueDepth: result.queueDepth,
          activeCount: result.activeCount,
          skipped: result.skipped,
        },
        '[FreeSessionAdmission] tick',
      )
    })
    .catch((error) => {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '[FreeSessionAdmission] tick failed',
      )
    })
    .finally(() => {
      inFlight = false
    })
}

export function startFreeSessionAdmission(): boolean {
  if (interval) return true
  if (!isWaitingRoomEnabled()) {
    logger.info({}, '[FreeSessionAdmission] Waiting room disabled — ticker not started')
    return false
  }
  interval = setInterval(runTick, ADMISSION_TICK_MS)
  if (typeof interval.unref === 'function') interval.unref()
  runTick() // fire first tick immediately
  logger.info(
    { tickMs: ADMISSION_TICK_MS },
    '[FreeSessionAdmission] Started',
  )
  return true
}

export function stopFreeSessionAdmission(): void {
  if (interval) clearInterval(interval)
  interval = null
  inFlight = false
}

export function __resetFreeSessionAdmissionForTests(): void {
  stopFreeSessionAdmission()
}
