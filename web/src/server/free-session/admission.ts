import {
  SUPPORTED_FREEBUFF_MODELS,
  isFreebuffModelAvailable,
} from '@codebuff/common/constants/freebuff-models'

import {
  ADMISSION_TICK_MS,
  getSessionGraceMs,
  getSessionLengthMs,
  isWaitingRoomEnabled,
} from './config'
import { getFleetHealth, routeForAdmission } from './fireworks-health'
import {
  activeCountsByModel,
  admitFromQueue,
  evictBanned,
  queueDepth,
  sweepExpired,
} from './store'

import { deploymentTtftP90Ms } from '@/llm-api/fireworks-ttft'

import type {
  FireworksHealth,
  FireworksRoute,
  FleetHealth,
} from './fireworks-health'

import { logger } from '@/util/logger'

export interface AdmissionDeps {
  sweepExpired: (now: Date, graceMs: number) => Promise<number>
  evictBanned: () => Promise<number>
  queueDepth: (params: { model: string }) => Promise<number>
  activeCountsByModel: () => Promise<Record<string, number>>
  admitFromQueue: (params: {
    model: string
    sessionLengthMs: number
    now: Date
    health: FireworksHealth
    fireworksRoute?: FireworksRoute | null
  }) => Promise<{
    admitted: { user_id: string }[]
    skipped: FireworksHealth | null
  }>
  getFleetHealth: () => Promise<FleetHealth>
  /** Plain values, not thunks — these never change at runtime. */
  sessionLengthMs: number
  graceMs: number
  /** Models to run admission ticks for. Defaults to the full model registry. */
  models?: readonly string[]
  now?: () => Date
}

const defaultDeps: AdmissionDeps = {
  sweepExpired,
  evictBanned,
  queueDepth,
  activeCountsByModel,
  admitFromQueue,
  // FREEBUFF_DEV_FORCE_ADMIT lets local `dev:freebuff` drive the full
  // waiting-room → admitted → ended flow without a real upstream. Returning
  // an empty fleet means every model resolves to the absence-default of
  // 'healthy' below.
  getFleetHealth:
    process.env.FREEBUFF_DEV_FORCE_ADMIT === 'true'
      ? async () => ({})
      : getFleetHealth,
  get sessionLengthMs() {
    return getSessionLengthMs()
  },
  get graceMs() {
    return getSessionGraceMs()
  },
}

export interface AdmissionTickResult {
  expired: number
  /** Free_session rows removed because the user is banned. */
  evictedBanned: number
  admitted: number
  /** Per-model queue depth at the end of the tick. */
  queueDepthByModel: Record<string, number>
  /** Per-model active-session count at the end of the tick. Models with no
   *  active sessions are omitted. */
  activeCountByModel: Record<string, number>
  skipped: FireworksHealth | null
}

/**
 * Run a single admission tick:
 *   1. Expire sessions past their expires_at + grace.
 *   2. For each model, attempt to admit one queued user. Admission proceeds
 *      only when the upstream health probe reports `healthy`; `degraded` and
 *      `unhealthy` both pause admission so the deployment can catch up.
 *
 * Per-model admission means heavier models can sit cold without starving
 * lighter ones. Admission still drips at (1 / ADMISSION_TICK_MS) per model.
 *
 * Returns counts for observability. Safe to call concurrently across pods —
 * admitFromQueue takes a per-model advisory xact lock.
 */
export async function runAdmissionTick(
  deps: AdmissionDeps = defaultDeps,
): Promise<AdmissionTickResult> {
  const now = (deps.now ?? (() => new Date()))()
  // Run eviction before admission so a banned user freed from a slot in this
  // tick frees room for a queued user to be admitted in the same tick.
  const [expired, evictedBanned] = await Promise.all([
    deps.sweepExpired(now, deps.graceMs),
    deps.evictBanned(),
  ])

  const models = deps.models ?? SUPPORTED_FREEBUFF_MODELS.map((m) => m.id)

  // One probe per tick covers every model — the Fireworks metrics endpoint
  // returns all deployments in a single response. Models without a dedicated
  // deployment (e.g. serverless) aren't in the map; treat their absence as
  // 'healthy' so admission continues. TODO: when those models move to their
  // own deployments, drop the absence-default and require an explicit entry.
  const fleet = await deps.getFleetHealth()

  // Run per-model admission in parallel — they only contend on independent
  // advisory locks and a single update each.
  const perModel = await Promise.all(
    models.map(async (model) => {
      const isRegisteredModel = SUPPORTED_FREEBUFF_MODELS.some(
        (m) => m.id === model,
      )
      const health =
        !isRegisteredModel || isFreebuffModelAvailable(model, now)
          ? (fleet[model] ?? 'healthy')
          : 'unhealthy'
      const { admitted, skipped } = await deps.admitFromQueue({
        model,
        sessionLengthMs: deps.sessionLengthMs,
        now,
        health,
        // Pin the admitted session's upstream. This FIFO path only admits when
        // Prometheus health is healthy, but a high measured TTFT can still
        // divert to serverless here; most real traffic hits the instant-admit
        // path in requestSession.
        fireworksRoute: routeForAdmission(
          model,
          fleet,
          deploymentTtftP90Ms(model),
        ),
      })
      const depth = await deps.queueDepth({ model })
      return { model, admittedCount: admitted.length, depth, skipped }
    }),
  )

  const activeCountByModel = await deps.activeCountsByModel()
  const totalAdmitted = perModel.reduce((s, r) => s + r.admittedCount, 0)
  const queueDepthByModel = Object.fromEntries(
    perModel.map((r) => [r.model, r.depth]),
  )
  const skipped = perModel.find((r) => r.skipped)?.skipped ?? null

  return {
    expired,
    evictedBanned,
    admitted: totalAdmitted,
    queueDepthByModel,
    activeCountByModel,
    skipped,
  }
}

let interval: ReturnType<typeof setInterval> | null = null
let inFlight = false

/** A tick that runs longer than this is presumed hung. Ticks normally finish
 *  in well under a second; 60s is far past any healthy run but short enough
 *  that the loop recovers within a few intervals. */
export const TICK_WATCHDOG_MS = 60_000

export function runTick(
  deps?: AdmissionDeps,
  watchdogMs: number = TICK_WATCHDOG_MS,
): Promise<void> | undefined {
  if (inFlight) return
  inFlight = true
  // The inFlight guard prevents overlapping ticks, but it means a single tick
  // that hangs (an await that never settles — e.g. a DB query or upstream
  // fetch without a timeout) silently stops ALL sweeping and admission until
  // the process restarts. The watchdog releases the guard after watchdogMs so
  // the next interval firing starts fresh. The hung tick is abandoned, not
  // cancelled — if it ever completes it must not clear a newer tick's guard,
  // hence the tripped flag. A late completion racing a newer tick is
  // harmless: sweeps are idempotent and admission is serialized by a
  // per-model advisory lock.
  let watchdogTripped = false
  const watchdog = setTimeout(() => {
    watchdogTripped = true
    inFlight = false
    logger.error(
      { watchdogMs },
      '[FreeSessionAdmission] tick exceeded watchdog timeout — abandoning it so future ticks can run',
    )
  }, watchdogMs)
  if (typeof watchdog.unref === 'function') watchdog.unref()
  return runAdmissionTick(deps)
    .then((result) => {
      // Emit every tick so per-model queue depth and active counts form a
      // continuous time-series that can be charted over time.
      // metric=freebuff_waiting_room makes it filterable in the log aggregator.
      logger.info(
        {
          metric: 'freebuff_waiting_room',
          admitted: result.admitted,
          expired: result.expired,
          evictedBanned: result.evictedBanned,
          queueDepthByModel: result.queueDepthByModel,
          activeCountByModel: result.activeCountByModel,
          skipped: result.skipped,
          abandonedByWatchdog: watchdogTripped || undefined,
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
      clearTimeout(watchdog)
      if (!watchdogTripped) inFlight = false
    })
}

export function startFreeSessionAdmission(): boolean {
  if (interval) return true
  if (!isWaitingRoomEnabled()) {
    logger.info(
      {},
      '[FreeSessionAdmission] Waiting room disabled — ticker not started',
    )
    return false
  }
  interval = setInterval(runTick, ADMISSION_TICK_MS)
  if (typeof interval.unref === 'function') interval.unref()
  runTick() // fire first tick immediately
  logger.info({ tickMs: ADMISSION_TICK_MS }, '[FreeSessionAdmission] Started')
  return true
}

export function stopFreeSessionAdmission(): void {
  if (interval) clearInterval(interval)
  interval = null
  inFlight = false
}

export function __resetFreeSessionAdmissionForTests(): void {
  stopFreeSessionAdmission()
  lastOpportunisticSweepAt = 0
  opportunisticSweepInFlight = false
}

let lastOpportunisticSweepAt = 0
let opportunisticSweepInFlight = false

/**
 * Traffic-driven safety net for the expiry sweep. The admission tick's
 * `setInterval` is `.unref()`'d and can be starved when the event loop is
 * saturated under load — exactly when zombies accumulate fastest — silently
 * stopping the sweep until the process restarts. This is called from the
 * `requestSession` hot path so cleanup keeps happening as long as requests
 * flow, independent of the interval.
 *
 * Best-effort and non-blocking: throttled to one sweep per `ADMISSION_TICK_MS`
 * per instance, guarded against overlap, and never rejects (the caller `void`s
 * it). A lagging or dead interval can no longer let `active` rows pile up past
 * `expires_at` and exhaust instant-admit capacity.
 */
export async function maybeSweepExpired(
  deps: Pick<AdmissionDeps, 'sweepExpired' | 'graceMs' | 'now'> = defaultDeps,
): Promise<void> {
  const now = (deps.now ?? (() => new Date()))()
  if (opportunisticSweepInFlight) return
  if (now.getTime() - lastOpportunisticSweepAt < ADMISSION_TICK_MS) return
  opportunisticSweepInFlight = true
  lastOpportunisticSweepAt = now.getTime()
  try {
    const swept = await deps.sweepExpired(now, deps.graceMs)
    if (swept > 0) {
      logger.info(
        { metric: 'freebuff_opportunistic_sweep', swept },
        '[FreeSessionAdmission] opportunistic sweep removed expired sessions',
      )
    }
  } catch (error) {
    logger.error({ error }, '[FreeSessionAdmission] opportunistic sweep failed')
  } finally {
    opportunisticSweepInFlight = false
  }
}
