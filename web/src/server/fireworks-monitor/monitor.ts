import { env } from '@codebuff/internal/env'

import { computeSnapshot, DEFAULT_HEALTH_THRESHOLDS } from './compute-health'
import { parsePrometheusText } from './parse-prometheus'

import { FIREWORKS_ACCOUNT_ID, FIREWORKS_DEPLOYMENT_MAP } from '@/llm-api/fireworks-config'
import { logger } from '@/util/logger'

import type { HealthThresholds } from './compute-health'
import type { FireworksHealthSnapshot, PromMetrics } from './types'

const FIREWORKS_METRICS_URL = (accountId: string) =>
  `https://api.fireworks.ai/v1/accounts/${accountId}/metrics`

const DEFAULT_POLL_INTERVAL_MS = 60_000
/** Random ± jitter so multiple pods don't line up and collectively exceed
 *  the Fireworks 6 req/min/account rate limit. */
const POLL_JITTER_MS = 10_000
const FETCH_TIMEOUT_MS = 15_000
/** Cap Retry-After honored on 429 so a bad header cannot stall the monitor
 *  indefinitely. */
const MAX_BACKOFF_MS = 5 * 60 * 1000
/** Fallback backoff if Fireworks returns 429 without a parseable Retry-After. */
const DEFAULT_429_BACKOFF_MS = 60_000

export interface MonitorOptions {
  apiKey: string
  accountId: string
  deployments: string[]
  pollIntervalMs?: number
  thresholds?: HealthThresholds
  fetch?: typeof globalThis.fetch
}

interface MonitorState {
  options: MonitorOptions
  metrics: PromMetrics | null
  lastError: string | null
  /** Earliest time at which the next scrape may fire (honors Retry-After). */
  backoffUntil: number
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  /** True once stopFireworksMonitor has been called — suppresses in-flight reschedules. */
  stopped: boolean
}

let state: MonitorState | null = null

class FireworksScrapeError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly retryAfterMs: number | null,
    bodyPreview: string,
  ) {
    super(`Fireworks metrics scrape failed: ${status} ${statusText}${bodyPreview ? ` — ${bodyPreview}` : ''}`)
    this.name = 'FireworksScrapeError'
  }
}

export async function scrapeFireworksMetrics(params: {
  apiKey: string
  accountId: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  now?: number
}): Promise<PromMetrics> {
  const fetchImpl = params.fetch ?? globalThis.fetch
  const response = await fetchImpl(FIREWORKS_METRICS_URL(params.accountId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    signal: params.signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
    throw new FireworksScrapeError(
      response.status,
      response.statusText,
      retryAfterMs,
      body.slice(0, 200),
    )
  }

  const text = await response.text()
  return parsePrometheusText(text, params.now ?? Date.now())
}

function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS)
  }
  const dateMs = Date.parse(raw)
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now()
    return Math.min(Math.max(delta, 0), MAX_BACKOFF_MS)
  }
  return null
}

function jittered(intervalMs: number): number {
  const delta = (Math.random() * 2 - 1) * POLL_JITTER_MS
  return Math.max(1_000, Math.round(intervalMs + delta))
}

async function pollOnce(): Promise<void> {
  if (!state) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const metrics = await scrapeFireworksMetrics({
      apiKey: state.options.apiKey,
      accountId: state.options.accountId,
      fetch: state.options.fetch,
      signal: controller.signal,
    })
    state.metrics = metrics
    state.lastError = null
    state.backoffUntil = 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.lastError = message
    if (error instanceof FireworksScrapeError && error.status === 429) {
      const backoffMs = error.retryAfterMs ?? DEFAULT_429_BACKOFF_MS
      state.backoffUntil = Date.now() + backoffMs
      logger.warn(
        { status: 429, backoffMs },
        '[FireworksMonitor] Rate limited, backing off',
      )
    } else {
      logger.warn({ error: message }, '[FireworksMonitor] Scrape failed')
    }
  } finally {
    clearTimeout(timeout)
  }
}

function scheduleNext() {
  if (!state || state.stopped) return
  const intervalMs = state.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const base = jittered(intervalMs)
  const untilBackoff = Math.max(0, state.backoffUntil - Date.now())
  const delayMs = Math.max(base, untilBackoff)
  const timer = setTimeout(runTick, delayMs)
  if (typeof timer.unref === 'function') timer.unref()
  state.timer = timer
}

function runTick() {
  if (!state || state.stopped || state.inFlight) {
    scheduleNext()
    return
  }
  state.inFlight = pollOnce().finally(() => {
    if (!state) return
    state.inFlight = null
    scheduleNext()
  })
}

export function startFireworksMonitor(options: Partial<MonitorOptions> = {}): boolean {
  if (state) return true

  const apiKey = options.apiKey ?? env.FIREWORKS_API_KEY
  if (!apiKey) {
    logger.warn({}, '[FireworksMonitor] FIREWORKS_API_KEY not set — monitor not started')
    return false
  }

  const accountId = options.accountId ?? FIREWORKS_ACCOUNT_ID
  const deployments =
    options.deployments ?? Object.values(FIREWORKS_DEPLOYMENT_MAP)
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const thresholds = options.thresholds ?? DEFAULT_HEALTH_THRESHOLDS

  state = {
    options: {
      apiKey,
      accountId,
      deployments,
      pollIntervalMs,
      thresholds,
      fetch: options.fetch,
    },
    metrics: null,
    lastError: null,
    backoffUntil: 0,
    timer: null,
    inFlight: null,
    stopped: false,
  }

  // First scrape runs immediately; subsequent scrapes are self-scheduled via
  // scheduleNext() with jitter so N pods don't synchronise.
  runTick()

  logger.info(
    {
      accountId,
      deployments,
      pollIntervalMs,
    },
    '[FireworksMonitor] Started',
  )
  return true
}

export function stopFireworksMonitor(): void {
  if (!state) return
  state.stopped = true
  if (state.timer) clearTimeout(state.timer)
  state = null
}

export function getFireworksHealthSnapshot(now: number = Date.now()): FireworksHealthSnapshot {
  if (!state) {
    return {
      scrapedAt: null,
      ageMs: null,
      overall: 'unknown',
      deployments: {},
      lastError: 'monitor not started',
    }
  }
  return computeSnapshot({
    metrics: state.metrics,
    deployments: state.options.deployments,
    thresholds: state.options.thresholds,
    now,
    lastError: state.lastError,
  })
}

/**
 * Gate free-session admission: ONLY returns true when the latest snapshot is
 * 'healthy'. Any other status — 'degraded', 'unhealthy', 'unknown' — fails
 * closed so the waiting room catches requests during incidents, cold starts,
 * or monitor failures.
 *
 * Pass `deploymentId` to gate on a specific deployment instead of the overall
 * worst-case.
 */
export function isFireworksAdmissible(deploymentId?: string): boolean {
  const snapshot = getFireworksHealthSnapshot()
  if (deploymentId) {
    const match = Object.values(snapshot.deployments).find(
      (d) => d.deploymentId === deploymentId || d.deployment === deploymentId,
    )
    return match?.status === 'healthy'
  }
  return snapshot.overall === 'healthy'
}

/** Force an immediate scrape (for tests / admin endpoints). Resolves when done. */
export async function refreshFireworksHealthNow(): Promise<void> {
  if (!state) return
  await pollOnce()
}

export function __resetFireworksMonitorForTests(): void {
  stopFireworksMonitor()
}
