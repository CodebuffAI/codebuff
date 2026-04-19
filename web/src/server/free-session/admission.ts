import { env } from '@codebuff/internal/env'

import {
  ADMISSION_TICK_MS,
  MAX_ADMITS_PER_TICK,
  getSessionGraceMs,
  getSessionLengthMs,
  isWaitingRoomEnabled,
} from './config'
import { admitFromQueue, countActive, queueDepth, sweepExpired } from './store'

import { FIREWORKS_ACCOUNT_ID } from '@/llm-api/fireworks-config'
import { logger } from '@/util/logger'

interface AdmissionState {
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  tickCount: number
}

let state: AdmissionState | null = null

/** Emit a `[FreeSessionAdmission] snapshot` log every N ticks even when
 *  nothing changed, so dashboards / alerts have a reliable heartbeat of
 *  queue depth and active count. At ADMISSION_TICK_MS=15s, 10 ticks = 2.5 min. */
const SNAPSHOT_EVERY_N_TICKS = 10

const FIREWORKS_METRICS_URL = `https://api.fireworks.ai/v1/accounts/${FIREWORKS_ACCOUNT_ID}/metrics`
const HEALTH_CHECK_TIMEOUT_MS = 5_000

/** Fails closed on DNS failure, non-OK status, or timeout — so admission halts
 *  whenever the upstream is unreachable and resumes on its own when it recovers. */
export async function isFireworksAdmissible(): Promise<boolean> {
  const apiKey = env.FIREWORKS_API_KEY
  if (!apiKey) return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(FIREWORKS_METRICS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export interface AdmissionDeps {
  sweepExpired: (now: Date, graceMs: number) => Promise<number>
  countActive: (now: Date) => Promise<number>
  queueDepth: () => Promise<number>
  admitFromQueue: (params: {
    limit: number
    sessionLengthMs: number
    now: Date
  }) => Promise<{ user_id: string }[]>
  isFireworksAdmissible: () => Promise<boolean>
  getMaxAdmitsPerTick: () => number
  getSessionLengthMs: () => number
  getSessionGraceMs: () => number
  now?: () => Date
}

const defaultDeps: AdmissionDeps = {
  sweepExpired,
  countActive,
  queueDepth,
  admitFromQueue,
  // FREEBUFF_DEV_FORCE_ADMIT lets local `dev:freebuff` drive the full
  // waiting-room → admitted → draining → ended flow without a real upstream.
  isFireworksAdmissible:
    process.env.FREEBUFF_DEV_FORCE_ADMIT === 'true'
      ? async () => true
      : isFireworksAdmissible,
  getMaxAdmitsPerTick: () => MAX_ADMITS_PER_TICK,
  getSessionLengthMs,
  getSessionGraceMs,
}

export interface AdmissionTickResult {
  expired: number
  admitted: number
  active: number
  queueDepth: number
  skipped: 'health' | null
}

/**
 * Run a single admission tick:
 *   1. Expire sessions past their expires_at.
 *   2. If Fireworks is not reachable, skip admission (waiting queue grows).
 *   3. Admit up to maxAdmitsPerTick queued users.
 *
 * There is no global concurrency cap — the Fireworks health probe is the
 * primary gate. Admission drips at (maxAdmitsPerTick / ADMISSION_TICK_MS),
 * which drives utilization up slowly; once the probe fails, step 2 halts
 * admission until things recover.
 *
 * Returns counts for observability. Safe to call concurrently across pods —
 * the underlying admit query takes an advisory xact lock.
 */
export async function runAdmissionTick(
  deps: AdmissionDeps = defaultDeps,
): Promise<AdmissionTickResult> {
  const now = (deps.now ?? (() => new Date()))()
  const expired = await deps.sweepExpired(now, deps.getSessionGraceMs())

  if (!(await deps.isFireworksAdmissible())) {
    const [active, depth] = await Promise.all([
      deps.countActive(now),
      deps.queueDepth(),
    ])
    return { expired, admitted: 0, active, queueDepth: depth, skipped: 'health' }
  }

  const active = await deps.countActive(now)
  const admitted = await deps.admitFromQueue({
    limit: deps.getMaxAdmitsPerTick(),
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
    { tickMs: ADMISSION_TICK_MS, maxAdmitsPerTick: MAX_ADMITS_PER_TICK },
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
