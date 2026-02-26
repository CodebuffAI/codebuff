import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postWebSearch } from '../_post'

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
import type { BlockGrantResult } from '@codebuff/billing/subscription'

const testServerEnv = { LINKUP_API_KEY: 'test-linkup-key' }

describe('/api/v1/web-search POST endpoint', () => {
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
      usageThisCycle: 0,
      balance: {
        totalRemaining: 10,
        totalDebt: 0,
        netBalance: 10,
        breakdown: {},
      },
      nextQuotaReset: 'soon',
    }))
    mockGetUserInfoFromApiKey = mock(async ({ apiKey }) =>
      apiKey === 'valid' ? { id: 'user-1' } : null,
    ) as GetUserInfoFromApiKeyFn
    mockConsumeCreditsWithFallback = mock(async () => ({
      success: true,
      value: { chargedToOrganization: false },
    })) as ConsumeCreditsWithFallbackFn

    // Mock fetch to return Linkup-like response
    mockFetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ answer: 'result', sources: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      { preconnect: () => {} },
    ) as typeof fetch
  })

  afterEach(() => {
    mock.restore()
  })

  test('401 when missing API key', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/web-search', {
      method: 'POST',
      body: JSON.stringify({ query: 'foo' }),
    })
    const res = await postWebSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })
    expect(res.status).toBe(401)
  })

  test('402 when insufficient credits', async () => {
    mockGetUserUsageData = mock(async () => ({
      usageThisCycle: 0,
      balance: {
        totalRemaining: 0,
        totalDebt: 0,
        netBalance: 0,
        breakdown: {},
      },
      nextQuotaReset: 'soon',
    }))
    const req = new NextRequest('http://localhost:3000/api/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ query: 'foo' }),
    })
    const res = await postWebSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })
    expect(res.status).toBe(402)
  })

  test('200 on success', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ query: 'hello', depth: 'standard' }),
    })
    const res = await postWebSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result).toBeDefined()
  })

  test('200 for subscriber with 0 a-la-carte credits but active block grant', async () => {
    mockGetUserUsageData = mock(async ({ includeSubscriptionCredits }: { includeSubscriptionCredits?: boolean }) => ({
      usageThisCycle: 0,
      balance: {
        totalRemaining: includeSubscriptionCredits ? 350 : 0,
        totalDebt: 0,
        netBalance: includeSubscriptionCredits ? 350 : 0,
        breakdown: {},
      },
      nextQuotaReset: 'soon',
    }))
    const mockEnsureSubscriberBlockGrant = mock(async () => ({
      grantId: 'grant-1',
      credits: 350,
      expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
      isNew: true,
    })) as unknown as (params: { userId: string; logger: Logger }) => Promise<BlockGrantResult | null>

    const req = new NextRequest('http://localhost:3000/api/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ query: 'hello' }),
    })
    const res = await postWebSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
      serverEnv: testServerEnv,
      ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
    })
    expect(res.status).toBe(200)
  })

  test('402 for non-subscriber with 0 credits and no block grant', async () => {
    mockGetUserUsageData = mock(async () => ({
      usageThisCycle: 0,
      balance: {
        totalRemaining: 0,
        totalDebt: 0,
        netBalance: 0,
        breakdown: {},
      },
      nextQuotaReset: 'soon',
    }))
    const mockEnsureSubscriberBlockGrant = mock(async () => null) as unknown as (params: { userId: string; logger: Logger }) => Promise<BlockGrantResult | null>

    const req = new NextRequest('http://localhost:3000/api/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ query: 'hello' }),
    })
    const res = await postWebSearch({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      getUserUsageData: mockGetUserUsageData,
      consumeCreditsWithFallback: mockConsumeCreditsWithFallback,
      fetch: mockFetch,
      serverEnv: testServerEnv,
      ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
    })
    expect(res.status).toBe(402)
  })
})
