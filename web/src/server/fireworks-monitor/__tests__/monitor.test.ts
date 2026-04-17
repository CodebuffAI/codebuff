import { afterEach, describe, expect, test } from 'bun:test'

import {
  __resetFireworksMonitorForTests,
  getFireworksHealthSnapshot,
  isFireworksAdmissible,
  refreshFireworksHealthNow,
  scrapeFireworksMetrics,
  startFireworksMonitor,
  stopFireworksMonitor,
} from '../monitor'

afterEach(() => {
  __resetFireworksMonitorForTests()
})

const DEPLOYMENT = 'accounts/test-acc/deployments/d1'

const HEALTHY_BODY = [
  `request_counter_total:sum_by_deployment{deployment="${DEPLOYMENT}",deployment_id="d1"} 10`,
  `requests_error_total:sum_by_deployment{deployment="${DEPLOYMENT}",deployment_id="d1",http_code="500"} 0`,
  `generator_kv_blocks_fraction:avg_by_deployment{deployment="${DEPLOYMENT}",deployment_id="d1"} 0.1`,
].join('\n')

function makeFetchMock(
  responses: Array<{ status: number; body?: string; headers?: Record<string, string> }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  let i = 0
  const impl = (async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init })
    const { status, body = '', headers = {} } = responses[Math.min(i, responses.length - 1)]
    i++
    return new Response(body, { status, headers })
  }) as unknown as typeof globalThis.fetch
  return { fetch: impl, calls: () => calls }
}

describe('scrapeFireworksMetrics', () => {
  test('sends Bearer auth + parses Prometheus response', async () => {
    const { fetch, calls } = makeFetchMock([
      { status: 200, body: HEALTHY_BODY },
    ])

    const metrics = await scrapeFireworksMetrics({
      apiKey: 'test-key',
      accountId: 'acc-1',
      fetch,
    })

    expect(metrics.samples.length).toBeGreaterThan(0)
    const recorded = calls()
    expect(recorded).toHaveLength(1)
    expect(recorded[0].url).toBe('https://api.fireworks.ai/v1/accounts/acc-1/metrics')
    const authHeader = (recorded[0].init?.headers as Record<string, string>)?.Authorization
    expect(authHeader).toBe('Bearer test-key')
  })

  test('throws FireworksScrapeError on 429 with retry-after seconds', async () => {
    const { fetch } = makeFetchMock([
      { status: 429, body: 'slow down', headers: { 'retry-after': '45' } },
    ])

    let caught: unknown = null
    try {
      await scrapeFireworksMetrics({ apiKey: 'k', accountId: 'acc', fetch })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    const scrapeError = caught as Error & { status?: number; retryAfterMs?: number | null }
    expect(scrapeError.status).toBe(429)
    expect(scrapeError.retryAfterMs).toBe(45_000)
  })
})

describe('startFireworksMonitor', () => {
  test('does not start when FIREWORKS_API_KEY is missing', () => {
    const started = startFireworksMonitor({ apiKey: '' })
    expect(started).toBe(false)
  })

  test('first scrape populates the snapshot immediately', async () => {
    const { fetch } = makeFetchMock([{ status: 200, body: HEALTHY_BODY }])

    startFireworksMonitor({
      apiKey: 'test-key',
      accountId: 'acc-1',
      deployments: [DEPLOYMENT],
      pollIntervalMs: 10 * 60_000,
      fetch,
    })

    await refreshFireworksHealthNow()

    const snap = getFireworksHealthSnapshot()
    expect(snap.overall).toBe('healthy')
    expect(snap.scrapedAt).not.toBeNull()
    expect(snap.deployments[DEPLOYMENT].status).toBe('healthy')
  })

  test('429 sets lastError and keeps snapshot unknown until a good scrape', async () => {
    const { fetch } = makeFetchMock([
      { status: 429, body: 'rate limited', headers: { 'retry-after': '30' } },
    ])

    startFireworksMonitor({
      apiKey: 'test-key',
      accountId: 'acc-1',
      deployments: [DEPLOYMENT],
      pollIntervalMs: 10 * 60_000,
      fetch,
    })

    await refreshFireworksHealthNow()

    const snap = getFireworksHealthSnapshot()
    expect(snap.overall).toBe('unknown')
    expect(snap.lastError).toMatch(/429/)
  })

  test('returns true and is idempotent on duplicate start', () => {
    const { fetch } = makeFetchMock([{ status: 200, body: HEALTHY_BODY }])
    expect(startFireworksMonitor({ apiKey: 'k', fetch })).toBe(true)
    expect(startFireworksMonitor({ apiKey: 'k', fetch })).toBe(true)
  })
})

describe('isFireworksAdmissible', () => {
  test('returns false when monitor not started', () => {
    expect(isFireworksAdmissible()).toBe(false)
  })

  test('returns true only when overall is healthy', async () => {
    const { fetch } = makeFetchMock([{ status: 200, body: HEALTHY_BODY }])
    startFireworksMonitor({
      apiKey: 'k',
      accountId: 'acc',
      deployments: [DEPLOYMENT],
      pollIntervalMs: 10 * 60_000,
      fetch,
    })
    await refreshFireworksHealthNow()
    expect(isFireworksAdmissible()).toBe(true)
  })

  test('fails closed on unhealthy (stale) snapshot', async () => {
    const { fetch } = makeFetchMock([
      { status: 200, body: HEALTHY_BODY },
      { status: 500, body: 'down' },
    ])
    startFireworksMonitor({
      apiKey: 'k',
      accountId: 'acc',
      deployments: [DEPLOYMENT],
      pollIntervalMs: 10 * 60_000,
      thresholds: { ...(await import('../compute-health')).DEFAULT_HEALTH_THRESHOLDS, staleSnapshotMs: 0 },
      fetch,
    })
    await refreshFireworksHealthNow() // good scrape

    // Force stale by waiting one event-loop tick; staleSnapshotMs=0 makes it stale immediately.
    await new Promise((r) => setTimeout(r, 1))
    expect(isFireworksAdmissible()).toBe(false)
  })

  test('can gate on a specific deployment id', async () => {
    const { fetch } = makeFetchMock([{ status: 200, body: HEALTHY_BODY }])
    startFireworksMonitor({
      apiKey: 'k',
      accountId: 'acc',
      deployments: [DEPLOYMENT],
      pollIntervalMs: 10 * 60_000,
      fetch,
    })
    await refreshFireworksHealthNow()

    expect(isFireworksAdmissible('d1')).toBe(true)
    expect(isFireworksAdmissible('unknown-id')).toBe(false)
  })
})

describe('stopFireworksMonitor', () => {
  test('is idempotent and safe to call when not started', () => {
    stopFireworksMonitor()
    stopFireworksMonitor()
  })
})
