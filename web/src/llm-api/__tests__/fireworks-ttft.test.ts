import { afterEach, describe, expect, test } from 'bun:test'

import {
  __resetFireworksTtftForTests,
  deploymentTtftP90Ms,
  recordDeploymentTtftMs,
  TTFT_MIN_SAMPLES,
  TTFT_WINDOW_MS,
} from '../fireworks-ttft'

const MODEL = 'minimax/minimax-m3'

afterEach(() => {
  __resetFireworksTtftForTests()
})

describe('fireworks TTFT aggregator', () => {
  test('returns undefined with no samples', () => {
    expect(deploymentTtftP90Ms(MODEL)).toBeUndefined()
  })

  test('returns undefined below the minimum sample count', () => {
    const now = 1_000_000
    for (let i = 0; i < TTFT_MIN_SAMPLES - 1; i++) {
      recordDeploymentTtftMs(MODEL, 500, now)
    }
    expect(deploymentTtftP90Ms(MODEL, now)).toBeUndefined()
  })

  test('computes nearest-rank p90 once enough samples exist', () => {
    const now = 1_000_000
    // 1..100 ms → p90 (nearest-rank, ceil(0.9*100)=90th) is 90.
    for (let i = 1; i <= 100; i++) recordDeploymentTtftMs(MODEL, i, now)
    expect(deploymentTtftP90Ms(MODEL, now)).toBe(90)
  })

  test('p90 ignores a small slow tail (<10%)', () => {
    const now = 1_000_000
    // 95 fast + 5 slow → p90 (95th smallest of 100) still lands in the fast bulk.
    for (let i = 0; i < 95; i++) recordDeploymentTtftMs(MODEL, 200, now)
    for (let i = 0; i < 5; i++) recordDeploymentTtftMs(MODEL, 5000, now)
    expect(deploymentTtftP90Ms(MODEL, now)).toBe(200)
  })

  test('p90 catches a fat slow tail (>10%)', () => {
    const now = 1_000_000
    // 85 fast + 15 slow → p90 lands in the slow tail, tripping the threshold.
    for (let i = 0; i < 85; i++) recordDeploymentTtftMs(MODEL, 200, now)
    for (let i = 0; i < 15; i++) recordDeploymentTtftMs(MODEL, 5000, now)
    expect(deploymentTtftP90Ms(MODEL, now)!).toBeGreaterThan(2000)
  })

  test('drops samples older than the rolling window', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 50; i++) recordDeploymentTtftMs(MODEL, 9000, t0)
    // Far in the future — every old sample has aged out of the window.
    const later = t0 + TTFT_WINDOW_MS + 1
    expect(deploymentTtftP90Ms(MODEL, later)).toBeUndefined()

    // Fresh samples at `later` are judged on their own.
    for (let i = 0; i < TTFT_MIN_SAMPLES; i++) {
      recordDeploymentTtftMs(MODEL, 300, later)
    }
    expect(deploymentTtftP90Ms(MODEL, later)).toBe(300)
  })

  test('ignores non-finite / negative samples', () => {
    const now = 1_000_000
    for (let i = 0; i < TTFT_MIN_SAMPLES; i++) {
      recordDeploymentTtftMs(MODEL, 400, now)
    }
    recordDeploymentTtftMs(MODEL, Number.NaN, now)
    recordDeploymentTtftMs(MODEL, -10, now)
    expect(deploymentTtftP90Ms(MODEL, now)).toBe(400)
  })

  test('tracks models independently', () => {
    const now = 1_000_000
    for (let i = 0; i < TTFT_MIN_SAMPLES; i++) {
      recordDeploymentTtftMs('a', 100, now)
      recordDeploymentTtftMs('b', 3000, now)
    }
    expect(deploymentTtftP90Ms('a', now)).toBe(100)
    expect(deploymentTtftP90Ms('b', now)).toBe(3000)
  })
})
