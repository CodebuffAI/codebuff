import { describe, expect, test } from 'bun:test'

import {
  computeDeploymentHealth,
  computeSnapshot,
  DEFAULT_HEALTH_THRESHOLDS,
} from '../compute-health'
import { parsePrometheusText } from '../parse-prometheus'

const DEPLOYMENT = 'accounts/test-acc/deployments/d1'

function fixture(params: {
  requestRate?: number
  errorRate?: number
  errorCode?: string
  concurrent?: number
  kvBlocks?: number
  kvSlots?: number
  queueBuckets?: Array<{ le: string; count: number }>
  ttftBuckets?: Array<{ le: string; count: number }>
}): string {
  const lines: string[] = []
  const labels = `base_model="m",deployment="${DEPLOYMENT}",deployment_account="test-acc",deployment_id="d1"`
  if (params.requestRate !== undefined) {
    lines.push(`request_counter_total:sum_by_deployment{${labels}} ${params.requestRate}`)
  }
  if (params.errorRate !== undefined) {
    const code = params.errorCode ?? '500'
    lines.push(
      `requests_error_total:sum_by_deployment{${labels},http_code="${code}"} ${params.errorRate}`,
    )
  }
  if (params.concurrent !== undefined) {
    lines.push(
      `requests_coordinator_concurrent_count:avg_by_deployment{${labels}} ${params.concurrent}`,
    )
  }
  if (params.kvBlocks !== undefined) {
    lines.push(
      `generator_kv_blocks_fraction:avg_by_deployment{${labels}} ${params.kvBlocks}`,
    )
  }
  if (params.kvSlots !== undefined) {
    lines.push(
      `generator_kv_slots_fraction:avg_by_deployment{${labels}} ${params.kvSlots}`,
    )
  }
  for (const bucket of params.queueBuckets ?? []) {
    lines.push(
      `latency_generation_queue_ms_bucket:sum_by_deployment{${labels},le="${bucket.le}"} ${bucket.count}`,
    )
  }
  for (const bucket of params.ttftBuckets ?? []) {
    lines.push(
      `latency_to_first_token_ms_bucket:sum_by_deployment{${labels},le="${bucket.le}"} ${bucket.count}`,
    )
  }
  return lines.join('\n')
}

describe('computeDeploymentHealth', () => {
  test('healthy deployment with low error rate and low utilization', () => {
    const metrics = parsePrometheusText(
      fixture({
        requestRate: 10,
        errorRate: 0,
        concurrent: 3,
        kvBlocks: 0.2,
        kvSlots: 0.2,
        queueBuckets: [
          { le: '100', count: 50 },
          { le: '1000', count: 100 },
          { le: '+Inf', count: 100 },
        ],
        ttftBuckets: [
          { le: '500', count: 60 },
          { le: '2000', count: 100 },
          { le: '+Inf', count: 100 },
        ],
      }),
    )

    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })

    expect(health.status).toBe('healthy')
    expect(health.reasons).toEqual([])
    expect(health.deploymentId).toBe('d1')
    expect(health.baseModel).toBe('m')
    expect(health.metrics.errorFraction).toBe(0)
  })

  test('flags high error rate as unhealthy', () => {
    const metrics = parsePrometheusText(
      fixture({ requestRate: 10, errorRate: 2, kvBlocks: 0.1 }),
    )
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.status).toBe('unhealthy')
    expect(health.metrics.errorFraction).toBeCloseTo(0.2, 5)
    expect(health.reasons.some((r) => r.includes('error rate'))).toBe(true)
  })

  test('flags mid error rate as degraded', () => {
    const metrics = parsePrometheusText(
      fixture({ requestRate: 100, errorRate: 5, kvBlocks: 0.1 }),
    )
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.status).toBe('degraded')
    expect(health.metrics.errorFraction).toBeCloseTo(0.05, 5)
  })

  test('flags saturated KV cache as unhealthy', () => {
    const metrics = parsePrometheusText(
      fixture({ requestRate: 10, errorRate: 0, kvBlocks: 0.995 }),
    )
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.status).toBe('unhealthy')
    expect(health.reasons.some((r) => r.includes('KV blocks'))).toBe(true)
  })

  test('flags long queue wait as unhealthy', () => {
    const metrics = parsePrometheusText(
      fixture({
        requestRate: 10,
        errorRate: 0,
        kvBlocks: 0.3,
        queueBuckets: [
          { le: '5000', count: 0 },
          { le: '20000', count: 100 },
          { le: '+Inf', count: 100 },
        ],
      }),
    )
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.status).toBe('unhealthy')
    expect(health.reasons.some((r) => r.includes('queue'))).toBe(true)
  })

  test('skips error-fraction check when request rate is below the floor', () => {
    const metrics = parsePrometheusText(
      fixture({ requestRate: 0.05, errorRate: 0.05, kvBlocks: 0.1 }),
    )
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.metrics.errorFraction).toBeCloseTo(1.0, 5)
    expect(health.status).toBe('healthy')
    expect(health.reasons.some((r) => r.includes('error rate'))).toBe(false)
  })

  test('still applies error-fraction check at or above the floor', () => {
    const metrics = parsePrometheusText(
      fixture({ requestRate: 0.1, errorRate: 0.05, kvBlocks: 0.1 }),
    )
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.status).toBe('unhealthy')
    expect(health.reasons.some((r) => r.includes('error rate'))).toBe(true)
  })

  test('sums error counters across multiple HTTP codes', () => {
    const labels = `base_model="m",deployment="${DEPLOYMENT}",deployment_id="d1"`
    const text = [
      `request_counter_total:sum_by_deployment{${labels}} 100`,
      `requests_error_total:sum_by_deployment{${labels},http_code="500"} 3`,
      `requests_error_total:sum_by_deployment{${labels},http_code="429"} 5`,
      `generator_kv_blocks_fraction:avg_by_deployment{${labels}} 0.1`,
    ].join('\n')
    const metrics = parsePrometheusText(text)
    const health = computeDeploymentHealth({
      deployment: DEPLOYMENT,
      metrics,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    })
    expect(health.metrics.errorRate).toBe(8)
    expect(health.metrics.errorFraction).toBeCloseTo(0.08, 5)
    expect(health.status).toBe('degraded')
  })
})

describe('computeSnapshot', () => {
  test('marks deployments as unknown when metrics have never been fetched', () => {
    const snap = computeSnapshot({
      metrics: null,
      deployments: [DEPLOYMENT],
      now: 1000,
    })
    expect(snap.overall).toBe('unknown')
    expect(snap.deployments[DEPLOYMENT].status).toBe('unknown')
    expect(snap.scrapedAt).toBeNull()
  })

  test('downgrades stale snapshots to unhealthy', () => {
    const metrics = parsePrometheusText(
      fixture({ requestRate: 10, errorRate: 0, kvBlocks: 0.1 }),
      1000,
    )
    const snap = computeSnapshot({
      metrics,
      deployments: [DEPLOYMENT],
      now: 1000 + DEFAULT_HEALTH_THRESHOLDS.staleSnapshotMs + 1,
    })
    expect(snap.overall).toBe('unhealthy')
    expect(snap.deployments[DEPLOYMENT].reasons[0]).toBe('snapshot stale')
  })

  test('overall status is the worst across deployments', () => {
    const dep2 = 'accounts/test-acc/deployments/d2'
    const text = [
      `request_counter_total:sum_by_deployment{deployment="${DEPLOYMENT}",deployment_id="d1"} 100`,
      `requests_error_total:sum_by_deployment{deployment="${DEPLOYMENT}",deployment_id="d1",http_code="500"} 0`,
      `generator_kv_blocks_fraction:avg_by_deployment{deployment="${DEPLOYMENT}",deployment_id="d1"} 0.1`,
      `request_counter_total:sum_by_deployment{deployment="${dep2}",deployment_id="d2"} 100`,
      `requests_error_total:sum_by_deployment{deployment="${dep2}",deployment_id="d2",http_code="500"} 30`,
      `generator_kv_blocks_fraction:avg_by_deployment{deployment="${dep2}",deployment_id="d2"} 0.1`,
    ].join('\n')
    const metrics = parsePrometheusText(text, 1000)
    const snap = computeSnapshot({
      metrics,
      deployments: [DEPLOYMENT, dep2],
      now: 1000,
    })
    expect(snap.deployments[DEPLOYMENT].status).toBe('healthy')
    expect(snap.deployments[dep2].status).toBe('unhealthy')
    expect(snap.overall).toBe('unhealthy')
  })
})
