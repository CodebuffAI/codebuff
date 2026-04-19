import { env } from '@codebuff/internal/env'

import {
  ADMISSION_TICK_MS,
  getSessionGraceMs,
  getSessionLengthMs,
  isWaitingRoomEnabled,
} from './config'
import { admitFromQueue, queueDepth, sweepExpired } from './store'

import { FIREWORKS_ACCOUNT_ID } from '@/llm-api/fireworks-config'
import { logger } from '@/util/logger'

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
  queueDepth: () => Promise<number>
  admitFromQueue: (params: {
    sessionLengthMs: number
    now: Date
    isFireworksAdmissible: () => Promise<boolean>
  }) => Promise<{ admitted: { user_id: string }[]; skipped: 'health' | null }>
  isFireworksAdmissible: () => Promise<boolean>
  /** Plain values, not thunks — these never change at runtime. */
  sessionLengthMs: number
  graceMs: number
  now?: () => Date
}

const defaultDeps: AdmissionDeps = {
  sweepExpired,
  queueDepth,
  admitFromQueue,
  // FREEBUFF_DEV_FORCE_ADMIT lets local `dev:freebuff` drive the full
  // waiting-room → admitted → ended flow without a real upstream.
  isFireworksAdmissible:
    process.env.FREEBUFF_DEV_FORCE_ADMIT === 'true'
      ? async () => true
      : isFireworksAdmissible,
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
  skipped: 'health' | null
}

/**
 * Run a single admission tick:
 *   1. Expire sessions past their expires_at + grace.
 *   2. Attempt to admit one queued user, gated by the Fireworks reachability
 *      probe (done inside admitFromQueue so we don't pay for an HTTP call
 *      when the advisory lock is already held by another pod — see
 *      `admitFromQueue`).
 *
 * There is no global concurrency cap — the Fireworks health probe is the
 * primary gate. Admission drips at (1 / ADMISSION_TICK_MS), which drives
 * utilization up slowly; once the probe fails, step 2 halts admission until
 * things recover.
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
    isFireworksAdmissible: deps.isFireworksAdmissible,
  })

  const depth = await deps.queueDepth()
  return { expired, admitted: admitted.length, queueDepth: depth, skipped }
}

let interval: ReturnType<typeof setInterval> | null = null
let inFlight = false

function runTick() {
  if (inFlight) return
  inFlight = true
  runAdmissionTick()
    .then((result) => {
      if (
        result.admitted > 0 ||
        result.expired > 0 ||
        result.skipped === 'health'
      ) {
        logger.info(
          {
            admitted: result.admitted,
            expired: result.expired,
            queueDepth: result.queueDepth,
            skipped: result.skipped,
          },
          '[FreeSessionAdmission] tick',
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
