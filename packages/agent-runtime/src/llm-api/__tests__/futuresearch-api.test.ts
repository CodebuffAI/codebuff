import { describe, expect, mock, test } from 'bun:test'

import { researchQuery } from '../futuresearch-api'

import type { ResearchEffort } from '@codebuff/common/constants/web-search'
import type { FutureSearchEnv } from '../futuresearch-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const testServerEnv: FutureSearchEnv = {
  FUTURESEARCH_API_KEY: 'sk-cho-test',
}

const mockLogger: Logger = {
  error: mock(() => {}),
  warn: mock(() => {}),
  info: mock(() => {}),
  debug: mock(() => {}),
}

const TASK_ID = '22222222-2222-2222-2222-222222222222'

const operationResponse = {
  task_id: TASK_ID,
  session_id: '11111111-1111-1111-1111-111111111111',
}
const statusRunning = {
  task_id: TASK_ID,
  session_id: '11111111-1111-1111-1111-111111111111',
  status: 'running',
  progress: { completed: 1, total: 4, running: 2 },
}
const statusCompleted = {
  task_id: TASK_ID,
  session_id: '11111111-1111-1111-1111-111111111111',
  status: 'completed',
}
const statusFailed = {
  task_id: TASK_ID,
  session_id: '11111111-1111-1111-1111-111111111111',
  status: 'failed',
  error: 'Research agent exhausted its budget',
}
const statusRevoked = {
  task_id: TASK_ID,
  session_id: '11111111-1111-1111-1111-111111111111',
  status: 'revoked',
}

const resultResponse = {
  task_id: TASK_ID,
  status: 'completed',
  data: [
    {
      answer:
        'The [React documentation](https://react.dev) is the primary source. ' +
        'See also [the blog](https://react.dev/blog/2024/02/15/react-labs-what-we-have-been-working-on).',
    },
  ],
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// Fetch mock that records every (url, method, body) triple it sees, so tests
// can assert exact call ordering and payloads.
const recordingFetch = (routes: {
  sessions?: () => Response
  operations?: () => Response
  status?: () => Response
  result?: () => Response
  cost?: () => Response
  cancel?: () => Response
  fallback?: () => Response
}) => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = []
  const fetch = Object.assign(
    async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (url.endsWith('/operations/multi-agent') && routes.operations) {
        return routes.operations()
      }
      if (url.endsWith('/status') && routes.status) return routes.status()
      if (url.endsWith('/result') && routes.result) return routes.result()
      if (url.endsWith('/cost') && routes.cost) return routes.cost()
      if (url.endsWith('/cancel') && routes.cancel) return routes.cancel()
      if (url.endsWith('/sessions') && routes.sessions) return routes.sessions()
      if (routes.fallback) return routes.fallback()
      return jsonResponse({ error: 'unexpected url' }, 404)
    },
    { preconnect: () => {} },
  ) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

const standardRoutes = (overrides?: {
  statuses?: Array<() => Response>
  result?: Response
  operations?: Response
  cost?: Response
}) => {
  const statusList = overrides?.statuses ?? [
    () => jsonResponse(statusRunning),
    () => jsonResponse(statusCompleted),
  ]
  let statusCalls = 0
  return {
    operations: () => overrides?.operations ?? jsonResponse(operationResponse),
    status: () => statusList[Math.min(statusCalls++, statusList.length - 1)](),
    result: () => overrides?.result ?? jsonResponse(resultResponse),
    cost: () =>
      overrides?.cost ??
      jsonResponse({ status: 'settled', cost_dollars: 0.42 }),
  }
}

const runQuery = async (options?: {
  query?: string
  depth?: 'standard' | 'deep'
  pollBudgetMs?: number
  effort?: ResearchEffort
  directions?: string[]
  context?: Array<{ title: string; content: string }>
  pollIntervalMs?: number
  pollMaxIntervalMs?: number
  routes?: ReturnType<typeof standardRoutes>
  serverEnv?: FutureSearchEnv
}) => {
  const { fetch, calls } = recordingFetch(options?.routes ?? standardRoutes())
  const raw = await researchQuery({
    query: options?.query ?? 'What are the latest React features?',
    depth: options?.depth,
    effort: options?.effort,
    directions: options?.directions,
    context: options?.context,
    logger: mockLogger,
    fetch,
    serverEnv: options?.serverEnv ?? testServerEnv,
    pollBudgetMs: options?.pollBudgetMs ?? 1000,
    pollIntervalMs: options?.pollIntervalMs ?? 5,
    pollMaxIntervalMs: options?.pollMaxIntervalMs,
  })
  return {
    result: raw?.result ?? null,
    costDollars: raw?.costDollars ?? null,
    calls,
  }
}

describe('FutureSearch API', () => {
  test('should research a query end to end', async () => {
    const { result, calls } = await runQuery()

    expect(result).not.toBeNull()
    const parsed = JSON.parse(result!)

    expect(parsed.provider).toBe('futuresearch')
    expect(parsed.query).toBe('What are the latest React features?')
    expect(parsed.effortLevel).toBe('low')
    expect(parsed.answer).toContain('[React documentation](https://react.dev)')
    expect(parsed.sources).toContainEqual({
      title: 'React documentation',
      url: 'https://react.dev',
    })
    expect(parsed.sources).toHaveLength(2)

    // No session creation round-trip: the API auto-creates a session.
    expect(calls.some((c) => c.url.endsWith('/sessions'))).toBe(false)
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false)
  })

  test('should map deep depth to high effort', async () => {
    const { result, calls } = await runQuery({ depth: 'deep' })

    expect(result).not.toBeNull()
    expect(JSON.parse(result!).effortLevel).toBe('high')
    const operationCall = calls.find((c) =>
      c.url.endsWith('/operations/multi-agent'),
    )
    expect(operationCall?.body).toMatchObject({ effort_level: 'high' })
  })

  test('should honor an explicit effort override', async () => {
    const { result, calls } = await runQuery({ effort: 'medium' })

    expect(result).not.toBeNull()
    expect(JSON.parse(result!).effortLevel).toBe('medium')
    const operationCall = calls.find((c) =>
      c.url.endsWith('/operations/multi-agent'),
    )
    expect(operationCall?.body).toMatchObject({ effort_level: 'medium' })
  })

  test('should POST the multi-agent body with no session_id', async () => {
    const { result, calls } = await runQuery({ query: 'Will AI take my job?' })

    expect(result).not.toBeNull()

    const operationCall = calls.find((c) =>
      c.url.endsWith('/operations/multi-agent'),
    )
    expect(operationCall?.method).toBe('POST')
    expect(operationCall?.body).toEqual({
      input: [],
      task: expect.stringContaining(
        'Will AI take my job?',
      ) as unknown as string,
      effort_level: 'low',
      join_with_input: true,
      return_list: false,
    })
    // session_id is omitted so the API auto-creates a session.
    expect(
      (operationCall?.body as Record<string, unknown>).session_id,
    ).toBeUndefined()
  })

  test('should send explicit directions in the multi-agent body', async () => {
    const { result, calls } = await runQuery({
      directions: [
        'Compare official docs vs community guides',
        'Check pricing tiers',
      ],
    })

    expect(result).not.toBeNull()
    const operationCall = calls.find((c) =>
      c.url.endsWith('/operations/multi-agent'),
    )
    expect(operationCall?.body).toMatchObject({
      directions: [
        'Compare official docs vs community guides',
        'Check pricing tiers',
      ],
      input: [],
    })
  })

  test('should send context rows as the multi-agent input', async () => {
    const { result, calls } = await runQuery({
      context: [
        { title: 'Finding 1', content: 'The docs recommend approach A.' },
        { title: 'Finding 2', content: 'Community favors approach B.' },
      ],
    })

    expect(result).not.toBeNull()
    const operationCall = calls.find((c) =>
      c.url.endsWith('/operations/multi-agent'),
    )
    expect(operationCall?.body).toMatchObject({
      input: [
        { title: 'Finding 1', content: 'The docs recommend approach A.' },
        { title: 'Finding 2', content: 'Community favors approach B.' },
      ],
    })
  })

  test('should return null when the provider rejects the request (e.g. missing/bad key)', async () => {
    // Wrapper no longer substitutes its own guidance sentence as a result;
    // a rejected request is a failed request. Callers guard the key first
    // (deep-research refuses, web-search falls back to serper).
    const routes = standardRoutes({
      operations: jsonResponse({ error: 'unauthorized' }, 401),
    })
    const { result, calls } = await runQuery({ routes })

    expect(result).toBeNull()
    expect(calls.some((c) => c.url.endsWith('/status'))).toBe(false)
  })

  test('should thread the settled cost into the result and model-visible JSON', async () => {
    const routes = standardRoutes({
      cost: jsonResponse({ status: 'settled', cost_dollars: 1.25 }),
    })
    const { result, costDollars, calls } = await runQuery({ routes })

    expect(result).not.toBeNull()
    expect(costDollars).toBe(1.25)
    expect(JSON.parse(result!).researchCostDollars).toBe(1.25)
    expect(calls.some((c) => c.url.endsWith('/cost'))).toBe(true)
  })

  test('should report null cost while the charge is pending', async () => {
    const routes = standardRoutes({
      cost: jsonResponse({ status: 'pending', cost_dollars: null }),
    })
    const { result, costDollars } = await runQuery({ routes })

    expect(result).not.toBeNull()
    expect(costDollars).toBeNull()
    expect(JSON.parse(result!).researchCostDollars).toBeNull()
  })

  test('should still return the result when the cost lookup fails', async () => {
    const routes = standardRoutes({
      cost: jsonResponse({ error: 'boom' }, 500),
    })
    const { result, costDollars } = await runQuery({ routes })

    expect(result).not.toBeNull()
    expect(costDollars).toBeNull()
  })

  test('should return null when multi-agent submit fails', async () => {
    const routes = standardRoutes({
      operations: jsonResponse({ error: 'boom' }, 500),
    })
    const { result } = await runQuery({ routes })

    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'multi-agent', status: 500 }),
      expect.stringContaining('500'),
    )
  })

  test('should return null when the task fails', async () => {
    const routes = standardRoutes({
      statuses: [() => jsonResponse(statusFailed)],
    })
    const { result } = await runQuery({ routes })

    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ taskStatus: 'failed' }),
      expect.stringContaining('failed'),
    )
  })

  test('should not cancel a task that has already failed', async () => {
    const routes = standardRoutes({
      statuses: [() => jsonResponse(statusRevoked)],
    })
    const { result, calls } = await runQuery({ routes })

    expect(result).toBeNull()
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false)
  })

  test('should cancel and give up when the task exceeds the poll budget', async () => {
    const routes = standardRoutes({
      statuses: [() => jsonResponse(statusRunning)],
    })
    const { result, calls } = await runQuery({
      routes,
      pollIntervalMs: 1000,
      pollBudgetMs: 10,
    })

    expect(result).toBeNull()
    const cancelCall = calls.find((c) => c.url.endsWith('/cancel'))
    expect(cancelCall).toBeDefined()
    expect(cancelCall?.method).toBe('POST')
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'poll budget exhausted' }),
      'FutureSearch task abandoned: poll budget exhausted',
    )
  })

  test('should keep polling on an unknown status instead of aborting', async () => {
    const routes = standardRoutes({
      statuses: [
        () => jsonResponse({ ...statusRunning, status: 'queued' }),
        () => jsonResponse(statusCompleted),
      ],
    })
    const { result, calls } = await runQuery({ routes })

    expect(result).not.toBeNull()
    const statusCalls = calls.filter((c) => c.url.endsWith('/status'))
    expect(statusCalls.length).toBeGreaterThanOrEqual(2)
  })

  test('should retry a transient status fetch failure instead of abandoning', async () => {
    const routes = standardRoutes({
      statuses: [
        () => jsonResponse({ error: 'boom' }, 500),
        () => jsonResponse(statusRunning),
        () => jsonResponse(statusCompleted),
      ],
    })
    const { result, calls } = await runQuery({ routes })

    expect(result).not.toBeNull()
    const statusCalls = calls.filter((c) => c.url.endsWith('/status'))
    expect(statusCalls.length).toBeGreaterThanOrEqual(3)
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false)
  })

  test('should cancel and give up after repeated status fetch failures', async () => {
    const fail = () => jsonResponse({ error: 'boom' }, 500)
    const routes = standardRoutes({
      statuses: [fail, fail, fail, fail],
    })
    const { result, calls } = await runQuery({
      routes,
      pollIntervalMs: 1,
      pollBudgetMs: 5000,
    })

    expect(result).toBeNull()
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(true)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'status fetch failed' }),
      'FutureSearch task abandoned: status fetch failed',
    )
  })

  test('should return null on network error', async () => {
    const fetch = Object.assign(
      async () => {
        throw new Error('Network error')
      },
      { preconnect: () => {} },
    ) as unknown as typeof globalThis.fetch

    const result = await researchQuery({
      query: 'anything',
      logger: mockLogger,
      fetch,
      serverEnv: testServerEnv,
    })

    expect(result).toBeNull()
  })

  test('should handle a scalar result object (non-list data)', async () => {
    const routes = standardRoutes({
      result: jsonResponse({
        task_id: TASK_ID,
        status: 'completed',
        data: { answer: 'A scalar [answer](https://example.com).' },
      }),
    })
    const { result } = await runQuery({ routes })

    expect(result).not.toBeNull()
    const parsed = JSON.parse(result!)
    expect(parsed.answer).toBe('A scalar [answer](https://example.com).')
    expect(parsed.sources).toEqual([
      { title: 'answer', url: 'https://example.com' },
    ])
  })

  test('should return null when the result has no usable answer', async () => {
    const routes = standardRoutes({
      result: jsonResponse({ task_id: TASK_ID, status: 'completed', data: [] }),
    })
    const { result } = await runQuery({ routes })

    expect(result).toBeNull()
  })
})
