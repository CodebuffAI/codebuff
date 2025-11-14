import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postDocsSearch } from '../_post'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  GetUserUsageDataFn,
  ConsumeCreditsWithFallbackFn,
} from '@codebuff/common/types/contracts/billing'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'

describe('/api/v1/docs-search POST endpoint', () => {
  let mockLogger: Logger
  let mockLoggerWithContext: LoggerWithContextFn
  let mockTrackEvent: TrackEventFn
  let mockGetUserUsageData: GetUserUsageDataFn
  let mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  let mockConsumeCreditsWithFallback: ConsumeCreditsWithFallbackFn
  let mockFetch: typeof globalThis.fetch

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    mockLoggerWithContext = mock(() => mockLogger)
    mockTrackEvent = mock(() => {})

    mockGetUserUsageData = mock(async () => ({
      balance: { totalRemaining: 10 },
      nextQuotaReset: 'soon',
    }))
    mockGetUserInfoFromApiKey = mock(async ({ apiKey }) =>
      apiKey === 'valid' ? ({ id: 'user-1' } as any) : null,
    )
    mockConsumeCreditsWithFallback = mock(
      async () =>
        ({ success: true, value: { chargedToOrganization: false } }) as any,
    )

    // Mock fetch for Context7 search and docs endpoints
    mockFetch = (async (url: any) => {
      const u = typeof url === 'string' ? new URL(url) : url
      if (String(u).includes('/search')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'lib1',
                title: 'Lib1',
                description: '',
                branch: 'main',
                lastUpdateDate: '',
                state: 'finalized',
                totalTokens: 100,
                totalSnippets: 10,
                totalPages: 1,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('Some documentation text', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }) as any
  })

  afterEach(() => {
    mock.restore()
  })

  test('401 when missing API key', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/docs-search', {
      method: 'POST',
      body: JSON.stringify({ libraryTitle: 'React' }),
    })
    const res = await postDocsSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
    })
    expect(res.status).toBe(401)
  })

  test('402 when insufficient credits', async () => {
    mockGetUserUsageData = mock(async () => ({
      balance: { totalRemaining: 0 },
      nextQuotaReset: 'soon',
    }))
    const req = new NextRequest('http://localhost:3000/api/v1/docs-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ libraryTitle: 'React' }),
    })
    const res = await postDocsSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
    })
    expect(res.status).toBe(402)
  })

  test('200 on success', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/docs-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ libraryTitle: 'React', topic: 'Hooks' }),
    })
    const res = await postDocsSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documentation).toContain('Some documentation text')
  })
})
