import { describe, expect, test } from 'bun:test'

import {
  KV_BLOCKS_DEGRADED_FRACTION,
  KV_BLOCKS_UNHEALTHY_FRACTION,
  PREFILL_QUEUE_P90_DEGRADED_MS,
  classifyOne,
} from '../fireworks-health'

type PromSample = { name: string; labels: Record<string, string>; value: number }

const DEPLOY = 'mjb4i7ea'

function kvBlocks(value: number): PromSample {
  return {
    name: 'generator_kv_blocks_fraction:avg_by_deployment',
    labels: { deployment_id: DEPLOY },
    value,
  }
}

/** Emit a cumulative-counts histogram for prefill queue where the p90
 *  percentile falls in the bucket with le ≥ p90Ms (i.e. p90 ≥ p90Ms).
 *  Uses 10 total events all landing in that bucket, so the 90th-percentile
 *  interpolates within the bucket above the bucket boundary. */
function prefillQueueBuckets(p90Ms: number): PromSample[] {
  const les = [50, 150, 300, 500, 750, 1000, 1500, 3000, 5000, 7500, 10000]
  const name = 'latency_prefill_queue_ms_bucket:sum_by_deployment'
  const total = 10
  return les.map((le) => ({
    name,
    labels: { deployment_id: DEPLOY, le: String(le) },
    value: le >= p90Ms ? total : 0,
  })).concat({
    name,
    labels: { deployment_id: DEPLOY, le: '+Inf' },
    value: total,
  })
}

function requests(rate: number): PromSample {
  return {
    name: 'request_counter_total:sum_by_deployment',
    labels: { deployment_id: DEPLOY },
    value: rate,
  }
}

function errors(code: string, rate: number): PromSample {
  return {
    name: 'requests_error_total:sum_by_deployment',
    labels: { deployment_id: DEPLOY, code },
    value: rate,
  }
}

describe('fireworks health classifier', () => {
  test('healthy when queue well under the threshold', () => {
    const samples: PromSample[] = [kvBlocks(0.5), ...prefillQueueBuckets(150)]
    expect(classifyOne(samples, DEPLOY)).toBe('healthy')
  })

  test('degraded when prefill queue p90 exceeds the threshold', () => {
    const samples: PromSample[] = [
      kvBlocks(0.5),
      ...prefillQueueBuckets(PREFILL_QUEUE_P90_DEGRADED_MS + 500),
    ]
    expect(classifyOne(samples, DEPLOY)).toBe('degraded')
  })

  test('degraded when KV blocks cross the soft threshold (leading indicator)', () => {
    const samples: PromSample[] = [
      kvBlocks(KV_BLOCKS_DEGRADED_FRACTION + 0.01),
      ...prefillQueueBuckets(300),
    ]
    expect(classifyOne(samples, DEPLOY)).toBe('degraded')
  })

  test('unhealthy when KV blocks exceed the backstop', () => {
    const samples: PromSample[] = [
      kvBlocks(KV_BLOCKS_UNHEALTHY_FRACTION + 0.005),
      ...prefillQueueBuckets(300),
    ]
    expect(classifyOne(samples, DEPLOY)).toBe('unhealthy')
  })

  test('unhealthy when 5xx error fraction exceeds the threshold', () => {
    const samples: PromSample[] = [
      kvBlocks(0.5),
      ...prefillQueueBuckets(300),
      requests(1),
      errors('500', 0.2),
    ]
    expect(classifyOne(samples, DEPLOY)).toBe('unhealthy')
  })

  test('ignores high error fraction when traffic is too low to be meaningful', () => {
    const samples: PromSample[] = [
      kvBlocks(0.5),
      ...prefillQueueBuckets(150),
      requests(0.05),
      errors('500', 0.05),
    ]
    expect(classifyOne(samples, DEPLOY)).toBe('healthy')
  })

  test('healthy with no data yet (new deployment, no events)', () => {
    expect(classifyOne([], DEPLOY)).toBe('healthy')
  })

  test('classifies deployments independently — one bad deployment does not affect another', () => {
    // The fleet probe builds the result by classifying each deployment
    // separately, so a saturated 'other' deployment leaves DEPLOY's
    // (only-degraded) verdict intact.
    const other = 'other123'
    const samples: PromSample[] = [
      kvBlocks(0.5),
      ...prefillQueueBuckets(PREFILL_QUEUE_P90_DEGRADED_MS + 500),
      {
        name: 'generator_kv_blocks_fraction:avg_by_deployment',
        labels: { deployment_id: other },
        value: KV_BLOCKS_UNHEALTHY_FRACTION + 0.005,
      },
    ]
    expect(classifyOne(samples, DEPLOY)).toBe('degraded')
    expect(classifyOne(samples, other)).toBe('unhealthy')
  })
})
