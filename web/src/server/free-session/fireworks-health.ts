import { FIREWORKS_ACCOUNT_ID, FIREWORKS_DEPLOYMENT_MAP } from '@/llm-api/fireworks-config'
import { env } from '@codebuff/internal/env'
import { logger } from '@/util/logger'

/**
 * Health of the Fireworks deployments that free sessions depend on.
 *
 *   - `healthy`    — admit as usual
 *   - `degraded`   — upstream reachable but loaded (prefill queue exceeds SLO);
 *                    do NOT admit new users so the queue can drain
 *   - `unhealthy`  — upstream unreachable / errored; do NOT admit
 *
 * Only `healthy` admits. `degraded` vs `unhealthy` is a logging/observability
 * distinction.
 */
export type FireworksHealth = 'healthy' | 'degraded' | 'unhealthy'

/** Degrade once median prefill-queue latency crosses this bound. Strict by
 *  design — a 1s queue on top of ~1s prefill already means users feel 2s+
 *  before first token. */
export const PREFILL_QUEUE_DEGRADED_MS = 125

/** Leading indicator of load — responds instantly to memory pressure, while
 *  prefill-queue p50 is a lagging window statistic. Degrading here lets us
 *  halt admission *before* users feel it. */
export const KV_BLOCKS_DEGRADED_FRACTION = 0.8

/** Hard backstop: if KV block memory gets this full, evictions dominate and
 *  even the median request will start stalling. */
export const KV_BLOCKS_UNHEALTHY_FRACTION = 0.98

/** Treat the metrics snapshot as unreliable if the newest sample is older
 *  than this (Fireworks exporter updates every ~30s, so 3min means 6 missed
 *  updates in a row — something is off with the exporter or our fetch). */
export const SNAPSHOT_STALE_MS = 3 * 60 * 1000

/** Only check error rate when requests/s is at least this — otherwise a
 *  single error spikes the ratio and causes false positives. */
export const ERROR_RATE_MIN_REQUEST_RATE = 0.1

/** 5xx fraction above this means the deployment is failing requests at a
 *  rate we shouldn't pile more users onto. */
export const ERROR_FRACTION_UNHEALTHY = 0.1

const METRICS_URL = `https://api.fireworks.ai/v1/accounts/${FIREWORKS_ACCOUNT_ID}/metrics`
const HEALTH_CHECK_TIMEOUT_MS = 5_000

/** Fireworks updates the Prometheus exporter every ~30s and rate-limits to
 *  6 requests/min per account. Cache a bit under the update cadence so every
 *  pod hits the endpoint at most ~2.4/min. */
const HEALTH_CACHE_TTL_MS = 25_000

type CacheEntry = { expiresAt: number; health: FireworksHealth }
let cache: CacheEntry | null = null

export function __resetFireworksHealthCacheForTests(): void {
  cache = null
}

export async function getFireworksHealth(): Promise<FireworksHealth> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.health

  const health = await probe()
  cache = { expiresAt: now + HEALTH_CACHE_TTL_MS, health }
  return health
}

async function probe(): Promise<FireworksHealth> {
  const apiKey = env.FIREWORKS_API_KEY
  if (!apiKey) return 'unhealthy'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  let body: string
  try {
    const response = await fetch(METRICS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!response.ok) return 'unhealthy'
    body = await response.text()
  } catch {
    return 'unhealthy'
  } finally {
    clearTimeout(timeout)
  }

  const deploymentIds = Object.values(FIREWORKS_DEPLOYMENT_MAP).map(
    (name) => name.split('/').pop()!,
  )
  if (deploymentIds.length === 0) return 'healthy'

  const { samples, newestTimestampMs } = parsePrometheus(body)

  if (
    newestTimestampMs !== undefined &&
    Date.now() - newestTimestampMs > SNAPSHOT_STALE_MS
  ) {
    logger.warn(
      { ageMs: Date.now() - newestTimestampMs },
      '[FireworksHealth] unhealthy: metrics snapshot is stale',
    )
    return 'unhealthy'
  }

  return classify(samples, deploymentIds)
}

/** Treat the whole fleet as degraded/unhealthy if any single deployment is. */
export function classify(
  samples: PromSample[],
  deploymentIds: string[],
): FireworksHealth {
  let worst: FireworksHealth = 'healthy'
  for (const deploymentId of deploymentIds) {
    const h = classifyOne(samples, deploymentId)
    if (h === 'unhealthy') return 'unhealthy'
    if (h === 'degraded') worst = 'degraded'
  }
  return worst
}

function classifyOne(samples: PromSample[], deploymentId: string): FireworksHealth {
  const kvBlocks = scalarFor(
    samples,
    'generator_kv_blocks_fraction:avg_by_deployment',
    deploymentId,
  )
  if (kvBlocks !== undefined && kvBlocks >= KV_BLOCKS_UNHEALTHY_FRACTION) {
    logger.info(
      { deploymentId, kvBlocks },
      '[FireworksHealth] unhealthy: KV blocks saturated',
    )
    return 'unhealthy'
  }

  const requestRate = scalarFor(
    samples,
    'request_counter_total:sum_by_deployment',
    deploymentId,
  )
  const error5xxRate = errorRateFor(samples, deploymentId, '500')
  if (
    requestRate !== undefined &&
    requestRate >= ERROR_RATE_MIN_REQUEST_RATE &&
    error5xxRate !== undefined &&
    error5xxRate / requestRate >= ERROR_FRACTION_UNHEALTHY
  ) {
    logger.info(
      {
        deploymentId,
        requestRate,
        error5xxRate,
        errorFraction: error5xxRate / requestRate,
      },
      '[FireworksHealth] unhealthy: 5xx error rate over threshold',
    )
    return 'unhealthy'
  }

  const p50 = histogramPercentile(
    samples,
    'latency_prefill_queue_ms_bucket:sum_by_deployment',
    deploymentId,
    50,
  )
  if (p50 !== undefined && p50 > PREFILL_QUEUE_DEGRADED_MS) {
    logger.info(
      { deploymentId, prefillQueueP50Ms: Math.round(p50), kvBlocks },
      '[FireworksHealth] degraded: prefill queue p50 over threshold',
    )
    return 'degraded'
  }

  if (kvBlocks !== undefined && kvBlocks >= KV_BLOCKS_DEGRADED_FRACTION) {
    logger.info(
      { deploymentId, kvBlocks },
      '[FireworksHealth] degraded: KV blocks above soft threshold',
    )
    return 'degraded'
  }

  return 'healthy'
}

function errorRateFor(
  samples: PromSample[],
  deploymentId: string,
  code: string,
): number | undefined {
  return samples.find(
    (s) =>
      s.name === 'requests_error_total:sum_by_deployment' &&
      s.labels.deployment_id === deploymentId &&
      s.labels.code === code,
  )?.value
}

type PromSample = { name: string; labels: Record<string, string>; value: number }

function parsePrometheus(text: string): {
  samples: PromSample[]
  newestTimestampMs: number | undefined
} {
  const samples: PromSample[] = []
  let newestTimestampMs: number | undefined
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const braceStart = line.indexOf('{')
    const braceEnd = line.indexOf('}')
    let name: string
    let labelStr = ''
    let rest: string
    if (braceStart === -1) {
      const parts = line.split(/\s+/)
      name = parts[0]
      rest = parts.slice(1).join(' ')
    } else {
      name = line.slice(0, braceStart)
      labelStr = line.slice(braceStart + 1, braceEnd)
      rest = line.slice(braceEnd + 1).trim()
    }
    const tokens = rest.split(/\s+/)
    const value = Number(tokens[0])
    if (!Number.isFinite(value)) continue
    // Prometheus text exposition: "<name>{<labels>} <value> [<timestamp_ms>]"
    if (tokens.length >= 2) {
      const ts = Number(tokens[1])
      if (Number.isFinite(ts) && (newestTimestampMs === undefined || ts > newestTimestampMs)) {
        newestTimestampMs = ts
      }
    }
    const labels: Record<string, string> = {}
    if (labelStr) {
      const re = /(\w+)="((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(labelStr)) !== null) labels[m[1]] = m[2]
    }
    samples.push({ name, labels, value })
  }
  return { samples, newestTimestampMs }
}

function scalarFor(
  samples: PromSample[],
  name: string,
  deploymentId: string,
): number | undefined {
  return samples.find(
    (s) => s.name === name && s.labels.deployment_id === deploymentId,
  )?.value
}

function histogramPercentile(
  samples: PromSample[],
  bucketMetric: string,
  deploymentId: string,
  percentile: number,
): number | undefined {
  const buckets = samples
    .filter(
      (s) => s.name === bucketMetric && s.labels.deployment_id === deploymentId,
    )
    .map((s) => ({
      le: s.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(s.labels.le),
      cum: s.value,
    }))
    .sort((a, b) => a.le - b.le)

  if (buckets.length === 0) return undefined
  const total = buckets[buckets.length - 1].cum
  if (total <= 0) return undefined

  const target = total * (percentile / 100)
  let prevLe = 0
  let prevCum = 0
  for (const { le, cum } of buckets) {
    if (cum >= target) {
      if (!Number.isFinite(le)) return prevLe
      if (cum === prevCum) return le
      const frac = (target - prevCum) / (cum - prevCum)
      return prevLe + frac * (le - prevLe)
    }
    prevLe = le
    prevCum = cum
  }
  return undefined
}
