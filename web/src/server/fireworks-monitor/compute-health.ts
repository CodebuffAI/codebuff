import {
  avgSamples,
  estimateHistogramPercentile,
  findSamples,
  sumSamples,
} from './parse-prometheus'

import type {
  DeploymentHealth,
  DeploymentHealthStatus,
  FireworksHealthSnapshot,
  PromMetrics,
  PromSample,
} from './types'

export interface HealthThresholds {
  /** If no successful scrape for this long, overall status is unhealthy. */
  staleSnapshotMs: number
  /** Minimum request rate (req/s) before applying the error-fraction check. Below
   *  this, a handful of transient errors on a near-idle deployment would flap the
   *  status unnecessarily. */
  minRequestRateForErrorCheck: number
  /** Fraction of requests erroring: above this → degraded. */
  errorFractionDegraded: number
  /** Fraction of requests erroring: above this → unhealthy. */
  errorFractionUnhealthy: number
  /** KV blocks fraction above this → degraded (queue contention imminent). */
  kvBlocksFractionDegraded: number
  /** KV blocks fraction above this → unhealthy (cache thrashing). */
  kvBlocksFractionUnhealthy: number
  /** p50 time spent in generation queue above this (ms) → degraded. */
  generationQueueMsDegraded: number
  /** p50 time spent in generation queue above this (ms) → unhealthy. */
  generationQueueMsUnhealthy: number
  /** p50 TTFT above this (ms) → degraded. */
  ttftMsDegraded: number
  /** p50 TTFT above this (ms) → unhealthy. */
  ttftMsUnhealthy: number
}

// Default thresholds are calibrated to the observed freebuff workload on
// glm-5.1 / kimi-k2.5. They are intentionally loose at first so a cold
// deployment does not flap; expect to tighten once you have a week of
// live data. Override per-instance via startFireworksMonitor({ thresholds }).
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  staleSnapshotMs: 3 * 60 * 1000,
  minRequestRateForErrorCheck: 0.1,
  errorFractionDegraded: 0.02,
  errorFractionUnhealthy: 0.1,
  kvBlocksFractionDegraded: 0.95,
  kvBlocksFractionUnhealthy: 0.99,
  generationQueueMsDegraded: 5_000,
  generationQueueMsUnhealthy: 15_000,
  ttftMsDegraded: 8_000,
  ttftMsUnhealthy: 30_000,
}

const STATUS_RANK: Record<DeploymentHealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  unhealthy: 2,
  unknown: 3,
}

export function computeDeploymentHealth(params: {
  deployment: string
  metrics: PromMetrics
  thresholds: HealthThresholds
}): DeploymentHealth {
  const { deployment, metrics, thresholds } = params
  const filter = { deployment }

  const requestRateSamples = findSamples(
    metrics,
    'request_counter_total:sum_by_deployment',
    filter,
  )
  const errorRateSamples = findSamples(
    metrics,
    'requests_error_total:sum_by_deployment',
    filter,
  )

  const requestRate = sumSamples(requestRateSamples)
  const errorRate = sumSamples(errorRateSamples)
  const errorFraction = requestRate > 0 ? errorRate / requestRate : 0

  const concurrentRequests =
    avgSamples(
      findSamples(
        metrics,
        'requests_coordinator_concurrent_count:avg_by_deployment',
        filter,
      ),
    ) ?? 0

  const kvBlocksFraction =
    avgSamples(
      findSamples(metrics, 'generator_kv_blocks_fraction:avg_by_deployment', filter),
    ) ?? 0
  const kvSlotsFraction =
    avgSamples(
      findSamples(metrics, 'generator_kv_slots_fraction:avg_by_deployment', filter),
    ) ?? 0

  const p50GenerationQueueMs = percentileForDeployment(
    metrics,
    'latency_generation_queue_ms_bucket:sum_by_deployment',
    deployment,
    0.5,
  )
  const p50TimeToFirstTokenMs = percentileForDeployment(
    metrics,
    'latency_to_first_token_ms_bucket:sum_by_deployment',
    deployment,
    0.5,
  )

  const baseModelSample = [
    ...requestRateSamples,
    ...errorRateSamples,
  ].find((s) => s.labels.base_model)
  const baseModel = baseModelSample?.labels.base_model ?? null
  const deploymentId = baseModelSample?.labels.deployment_id ?? parseDeploymentId(deployment)

  const reasons: string[] = []
  let status: DeploymentHealthStatus = 'healthy'

  const upgrade = (next: DeploymentHealthStatus) => {
    if (STATUS_RANK[next] > STATUS_RANK[status]) status = next
  }

  if (requestRate >= thresholds.minRequestRateForErrorCheck) {
    if (errorFraction >= thresholds.errorFractionUnhealthy) {
      reasons.push(`error rate ${(errorFraction * 100).toFixed(1)}% ≥ ${(thresholds.errorFractionUnhealthy * 100).toFixed(1)}%`)
      upgrade('unhealthy')
    } else if (errorFraction >= thresholds.errorFractionDegraded) {
      reasons.push(`error rate ${(errorFraction * 100).toFixed(1)}% ≥ ${(thresholds.errorFractionDegraded * 100).toFixed(1)}%`)
      upgrade('degraded')
    }
  }

  if (kvBlocksFraction >= thresholds.kvBlocksFractionUnhealthy) {
    reasons.push(`KV blocks ${(kvBlocksFraction * 100).toFixed(0)}% ≥ ${(thresholds.kvBlocksFractionUnhealthy * 100).toFixed(0)}%`)
    upgrade('unhealthy')
  } else if (kvBlocksFraction >= thresholds.kvBlocksFractionDegraded) {
    reasons.push(`KV blocks ${(kvBlocksFraction * 100).toFixed(0)}% ≥ ${(thresholds.kvBlocksFractionDegraded * 100).toFixed(0)}%`)
    upgrade('degraded')
  }

  if (p50GenerationQueueMs !== null) {
    if (p50GenerationQueueMs >= thresholds.generationQueueMsUnhealthy) {
      reasons.push(`p50 queue ${Math.round(p50GenerationQueueMs)}ms ≥ ${thresholds.generationQueueMsUnhealthy}ms`)
      upgrade('unhealthy')
    } else if (p50GenerationQueueMs >= thresholds.generationQueueMsDegraded) {
      reasons.push(`p50 queue ${Math.round(p50GenerationQueueMs)}ms ≥ ${thresholds.generationQueueMsDegraded}ms`)
      upgrade('degraded')
    }
  }

  if (p50TimeToFirstTokenMs !== null) {
    if (p50TimeToFirstTokenMs >= thresholds.ttftMsUnhealthy) {
      reasons.push(`p50 TTFT ${Math.round(p50TimeToFirstTokenMs)}ms ≥ ${thresholds.ttftMsUnhealthy}ms`)
      upgrade('unhealthy')
    } else if (p50TimeToFirstTokenMs >= thresholds.ttftMsDegraded) {
      reasons.push(`p50 TTFT ${Math.round(p50TimeToFirstTokenMs)}ms ≥ ${thresholds.ttftMsDegraded}ms`)
      upgrade('degraded')
    }
  }

  return {
    deploymentId,
    deployment,
    baseModel,
    status,
    reasons,
    metrics: {
      requestRate,
      errorRate,
      errorFraction,
      concurrentRequests,
      kvBlocksFraction,
      kvSlotsFraction,
      p50GenerationQueueMs,
      p50TimeToFirstTokenMs,
    },
  }
}

function percentileForDeployment(
  metrics: PromMetrics,
  metricName: string,
  deployment: string,
  percentile: number,
): number | null {
  const buckets: PromSample[] = findSamples(metrics, metricName, { deployment })
  return estimateHistogramPercentile(buckets, percentile)
}

function parseDeploymentId(deployment: string): string {
  const parts = deployment.split('/')
  return parts[parts.length - 1] ?? deployment
}

export function computeSnapshot(params: {
  metrics: PromMetrics | null
  deployments: string[]
  thresholds?: HealthThresholds
  now?: number
  lastError?: string | null
}): FireworksHealthSnapshot {
  const thresholds = params.thresholds ?? DEFAULT_HEALTH_THRESHOLDS
  const now = params.now ?? Date.now()
  const lastError = params.lastError ?? null

  if (!params.metrics) {
    const unknownDeployments: Record<string, DeploymentHealth> = {}
    for (const deployment of params.deployments) {
      unknownDeployments[deployment] = {
        deploymentId: parseDeploymentId(deployment),
        deployment,
        baseModel: null,
        status: 'unknown',
        reasons: ['no scrape yet'],
        metrics: {
          requestRate: 0,
          errorRate: 0,
          errorFraction: 0,
          concurrentRequests: 0,
          kvBlocksFraction: 0,
          kvSlotsFraction: 0,
          p50GenerationQueueMs: null,
          p50TimeToFirstTokenMs: null,
        },
      }
    }
    return {
      scrapedAt: null,
      ageMs: null,
      overall: 'unknown',
      deployments: unknownDeployments,
      lastError,
    }
  }

  const deployments: Record<string, DeploymentHealth> = {}
  let worst: DeploymentHealthStatus = 'healthy'

  const stale = now - params.metrics.scrapedAt > thresholds.staleSnapshotMs

  for (const deployment of params.deployments) {
    const health = computeDeploymentHealth({
      deployment,
      metrics: params.metrics,
      thresholds,
    })
    if (stale) {
      health.reasons.unshift('snapshot stale')
      if (STATUS_RANK['unhealthy'] > STATUS_RANK[health.status]) {
        health.status = 'unhealthy'
      }
    }
    deployments[deployment] = health
    if (STATUS_RANK[health.status] > STATUS_RANK[worst]) worst = health.status
  }

  return {
    scrapedAt: params.metrics.scrapedAt,
    ageMs: now - params.metrics.scrapedAt,
    overall: worst,
    deployments,
    lastError,
  }
}
