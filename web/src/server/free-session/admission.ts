import {
  ADMISSION_TICK_MS,
  MAX_ADMITS_PER_TICK,
  getMaxConcurrentSessions,
  getSessionLengthMs,
  isWaitingRoomEnabled,
} from './config'
import { admitFromQueue, countActive, queueDepth, sweepExpired } from './store'

import { isFireworksAdmissible } from '@/server/fireworks-monitor/monitor'
import { logger } from '@/util/logger'

interface AdmissionState {
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  tickCount: number
}

let state: AdmissionState | null = null

/** Emit a `[FreeSessionAdmission] snapshot` log every N ticks even when
 *  nothing changed, so dashboards / alerts have a reliable heartbeat of
 *  queue depth and active count. At ADMISSION_TICK_MS=5s, 12 ticks = 1 min. */
const SNAPSHOT_EVERY_N_TICKS = 12

export interface AdmissionDeps {
  sweepExpired: (now: Date) => Promise<number>
  countActive: (now: Date) => Promise<number>
  queueDepth: () => Promise<number>
  admitFromQueue: (params: {
    limit: number
    sessionLengthMs: number
    now: Date
  }) => Promise<{ user_id: string }[]>
  isFireworksAdmissible: () => boolean
  getMaxConcurrentSessions: () => number
  getSessionLengthMs: () => number
  now?: () => Date
}

const defaultDeps: AdmissionDeps = {
  sweepExpired,
  countActive,
  queueDepth,
  admitFromQueue,
  isFireworksAdmissible,
  getMaxConcurrentSessions,
  getSessionLengthMs,
}

export interface AdmissionTickResult {
  expired: number
  admitted: number
  active: number
  queueDepth: number
  skipped: 'health' | 'full' | null
}

/**
 * Run a single admission tick:
 *   1. Expire sessions past their expires_at.
 *   2. If Fireworks is not 'healthy', skip admission (waiting queue grows).
 *   3. Admit up to (maxConcurrent - activeCount, MAX_ADMITS_PER_TICK) users.
 *
 * Returns counts for observability. Safe to call concurrently across pods —
 * the underlying admit query takes an advisory xact lock.
 */
export async function runAdmissionTick(
  deps: AdmissionDeps = defaultDeps,
): Promise<AdmissionTickResult> {
  const now = (deps.now ?? (() => new Date()))()
  const expired = await deps.sweepExpired(now)

  if (!deps.isFireworksAdmissible()) {
    const [active, depth] = await Promise.all([
      deps.countActive(now),
      deps.queueDepth(),
    ])
    return { expired, admitted: 0, active, queueDepth: depth, skipped: 'health' }
  }

  const active = await deps.countActive(now)
  const max = deps.getMaxConcurrentSessions()
  const capacity = Math.min(Math.max(0, max - active), MAX_ADMITS_PER_TICK)
  if (capacity === 0) {
    const depth = await deps.queueDepth()
    return { expired, admitted: 0, active, queueDepth: depth, skipped: 'full' }
  }

  const admitted = await deps.admitFromQueue({
    limit: capacity,
    sessionLengthMs: deps.getSessionLengthMs(),
    now,
  })

  const depth = await deps.queueDepth()
  return {
    expired,
    admitted: admitted.length,
    active: active + admitted.length,
    queueDepth: depth,
    skipped: null,
  }
}

function scheduleNext() {
  if (!state) return
  const timer = setTimeout(runTick, ADMISSION_TICK_MS)
  if (typeof timer.unref === 'function') timer.unref()
  state.timer = timer
}

function runTick() {
  if (!state) return
  // If a tick is still inflight (previous tick ran long), skip without
  // rescheduling — the inflight Promise's finally will schedule the next one.
  // This prevents overlapping timers piling up.
  if (state.inFlight) return

  const tickIdx = ++state.tickCount
  state.inFlight = runAdmissionTick()
    .then((result) => {
      const changed = result.admitted > 0 || result.expired > 0
      const heartbeat = tickIdx % SNAPSHOT_EVERY_N_TICKS === 0
      if (changed || heartbeat || result.skipped === 'health') {
        logger.info(
          {
            admitted: result.admitted,
            expired: result.expired,
            active: result.active,
            queueDepth: result.queueDepth,
            maxConcurrent: getMaxConcurrentSessions(),
            skipped: result.skipped,
          },
          changed ? '[FreeSessionAdmission] tick' : '[FreeSessionAdmission] snapshot',
        )
      }
    })
    .catch((error) => {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '[FreeSessionAdmission] tick failed',
      )
    })
    .finally(() => {
      if (!state) return
      state.inFlight = null
      scheduleNext()
    })
}

export function startFreeSessionAdmission(): boolean {
  if (state) return true
  if (!isWaitingRoomEnabled()) {
    logger.info({}, '[FreeSessionAdmission] Waiting room disabled — ticker not started')
    return false
  }
  state = { timer: null, inFlight: null, tickCount: 0 }
  runTick()
  logger.info(
    { tickMs: ADMISSION_TICK_MS, maxConcurrent: getMaxConcurrentSessions() },
    '[FreeSessionAdmission] Started',
  )
  return true
}

export function stopFreeSessionAdmission(): void {
  if (!state) return
  if (state.timer) clearTimeout(state.timer)
  state = null
}

export function __resetFreeSessionAdmissionForTests(): void {
  stopFreeSessionAdmission()
}
