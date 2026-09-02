import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'

import {
  callDeepResearchAPI,
  callWebSearchAPI,
  DEEP_RESEARCH_FETCH_TIMEOUT_MS,
  FETCH_TIMEOUT_MS,
  MAX_RETRIES,
} from '../codebuff-web-api'

import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const mockEnv = {
  clientEnv: {} as unknown as ClientEnv,
  ciEnv: {} as unknown as CiEnv,
}

const BASE_URL = 'https://api.example.com'

const mockLogger: Logger = {
  error: mock(() => {}),
  warn: mock(() => {}),
  info: mock(() => {}),
  debug: mock(() => {}),
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('Codebuff web API facade', () => {
  // Record the timeout each request is wrapped in (withTimeout is stubbed to
  // pass through, so suites never wait on real clocks) — this is how the tests
  // assert which facade timeout constant actually reaches the request.
  const appliedTimeouts: number[] = []

  beforeAll(async () => {
    await mockModule('@codebuff/common/util/promise', () => ({
      withTimeout: async <T>(promise: Promise<T>, timeoutMs: number) => {
        appliedTimeouts.push(timeoutMs)
        return promise
      },
    }))
  })

  beforeEach(() => {
    appliedTimeouts.length = 0
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
  })

  const fetchReturning = (responses: Array<Response | (() => Response)>) => {
    let attempts = 0
    const fetch = Object.assign(
      async () => {
        const index = Math.min(attempts, responses.length - 1)
        attempts += 1
        const response = responses[index]
        return typeof response === 'function' ? response() : response
      },
      { preconnect: () => {} },
    ) as unknown as typeof globalThis.fetch
    return { fetch, attemptCount: () => attempts }
  }

  test('web-search success extracts result/credits and is bounded by the default timeout', async () => {
    const { fetch } = fetchReturning([
      jsonResponse({ result: '{"organic":[]}', creditsUsed: 2 }),
    ])

    const res = await callWebSearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res).toEqual({ result: '{"organic":[]}', creditsUsed: 2 })
    expect(appliedTimeouts).toContain(FETCH_TIMEOUT_MS)
  })

  test('web-search retries a transient 500 and recovers on the next attempt', async () => {
    const { fetch, attemptCount } = fetchReturning([
      jsonResponse({ error: 'boom' }, 500),
      jsonResponse({ result: 'ok' }),
    ])

    const res = await callWebSearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res.result).toBe('ok')
    expect(attemptCount()).toBe(2)
  })

  test('web-search gives up after a bounded number of attempts on a persistent 500', async () => {
    const { fetch, attemptCount } = fetchReturning([
      () => jsonResponse({ error: 'boom' }, 500),
    ])

    const res = await callWebSearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res.error).toContain('boom')
    expect(attemptCount()).toBe(MAX_RETRIES)
  })

  test('web-search does not retry a non-retryable 400', async () => {
    const { fetch, attemptCount } = fetchReturning([
      jsonResponse({ error: 'bad request' }, 400),
    ])

    const res = await callWebSearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res.error).toContain('bad request')
    expect(attemptCount()).toBe(1)
  })

  test('deep-research makes exactly one attempt on a failing response (no double bill)', async () => {
    // A second attempt would have succeeded — exactly why research must not
    // retry: re-submitting a billed task would charge twice.
    const { fetch, attemptCount } = fetchReturning([
      jsonResponse({ error: 'boom' }, 500),
      jsonResponse({ result: 'never reached' }),
    ])

    const res = await callDeepResearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res.error).toContain('boom')
    expect(attemptCount()).toBe(1)
  })

  test('deep-research requests are bounded by the deep-research timeout', async () => {
    const { fetch } = fetchReturning([
      jsonResponse({ result: 'ok', provider: 'futuresearch' }),
    ])

    const res = await callDeepResearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res.result).toBe('ok')
    expect(appliedTimeouts).toContain(DEEP_RESEARCH_FETCH_TIMEOUT_MS)
    expect(appliedTimeouts).not.toContain(FETCH_TIMEOUT_MS)
  })

  test('deep-research never retries a 200-with-error response (endpoint failure contract)', async () => {
    // The deep-research endpoint reports research failure as a 200 with an
    // error field precisely so the facade cannot treat it as retryable; a
    // retry here would re-submit a billed research task.
    const { fetch, attemptCount } = fetchReturning([
      jsonResponse({ error: 'FutureSearch research for "q" did not complete' }),
    ])

    const res = await callDeepResearchAPI({
      query: 'q',
      fetch,
      logger: mockLogger,
      env: mockEnv,
      baseUrl: BASE_URL,
      apiKey: 'k',
    })

    expect(res.error).toContain('did not complete')
    expect(attemptCount()).toBe(1)
  })
})
