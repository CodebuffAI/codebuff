import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postGravityIndex } from '../_post'
import { sha256 } from '@/lib/crypto'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'

const testServerEnv = { GRAVITY_API_KEY: 'gravity-key' }

describe('/api/v1/gravity-index POST endpoint', () => {
  let mockLogger: Logger
  let mockLoggerWithContext: LoggerWithContextFn
  let mockTrackEvent: TrackEventFn
  let mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  let mockFetch: typeof globalThis.fetch
  let mockWarn: ReturnType<typeof mock>

  beforeEach(() => {
    mockWarn = mock(() => {})
    mockLogger = {
      error: mock(() => {}),
      warn: mockWarn,
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    mockLoggerWithContext = mock(() => mockLogger)
    mockTrackEvent = mock(() => {})
    mockGetUserInfoFromApiKey = mock(async ({ apiKey }) =>
      apiKey === 'valid'
        ? { id: 'user-1', email: 'USER@example.COM', discord_id: null }
        : null,
    ) as GetUserInfoFromApiKeyFn
    mockFetch = Object.assign(
      mock(async () =>
        Response.json({
          search_id: 'search-1',
          recommendation: {
            name: 'SendGrid',
            slug: 'sendgrid',
            category: 'Email',
            website_url: 'https://sendgrid.com',
            docs_url: 'https://docs.sendgrid.com',
          },
          reasoning: 'Best fit for transactional email.',
          install: {
            summary: 'Create an API key',
            env_vars: ['SENDGRID_API_KEY'],
          },
          credential_request: {
            setup_url: 'https://index.trygravity.ai/go/test',
            required_env_vars: ['SENDGRID_API_KEY'],
            user_message:
              'Open the setup link for SendGrid and paste SENDGRID_API_KEY.',
            agent_instruction: 'Pause until the user supplies credentials.',
            grclid: 'test',
          },
          click_url: 'https://index.trygravity.ai/go/test',
          grclid: 'test',
        }),
      ),
      { preconnect: () => {} },
    ) as typeof fetch
  })

  afterEach(() => {
    mock.restore()
  })

  test('401 when missing API key', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      body: JSON.stringify({
        action: 'search',
        query: 'transactional email',
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(401)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('503 when Gravity API key is not configured', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({
        action: 'search',
        query: 'transactional email',
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: {},
    })

    expect(res.status).toBe(503)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('catalog browse requires Gravity API key', async () => {
    mockFetch = Object.assign(
      mock(async () =>
        Response.json({
          services: [{ name: 'SendGrid', slug: 'sendgrid' }],
          total: 1,
        }),
      ),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ action: 'browse', category: 'Email' }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: {},
    })

    expect(res.status).toBe(503)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('sends Gravity API key in headers and attribution from trusted server data', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({
        action: 'search',
        query: 'transactional email',
        api_key: 'user-supplied-key',
        external_user_id_hash: 'user-supplied-user',
        email_hash: 'user-supplied-email',
        external_session_id: 'session-1',
        metadata: { surface: 'test' },
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = (mockFetch as unknown as ReturnType<typeof mock>).mock
      .calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-Key': 'gravity-key',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      query: 'transactional email',
      external_session_id: 'session-1',
      external_user_id_hash: sha256('user-1'),
      email_hash: sha256('user@example.com'),
      metadata: { surface: 'test' },
    })
  })

  test('returns Gravity recommendation on success', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({
        action: 'search',
        query: 'transactional email',
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recommendation.name).toBe('SendGrid')
    expect(body.credential_request.setup_url).toBe(
      'https://index.trygravity.ai/go/test',
    )
    expect(body.click_url).toBe('https://index.trygravity.ai/go/test')
    expect(body.conversion_url).toBeUndefined()
    expect(body.creditsUsed).toBe(0)
  })

  test('browse maps to GET /services with filters', async () => {
    mockFetch = Object.assign(
      mock(async () =>
        Response.json({
          services: [{ name: 'SendGrid', slug: 'sendgrid' }],
          total: 1,
          categories: ['Email'],
        }),
      ),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ action: 'browse', category: 'Email', q: 'send' }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(200)
    expect(
      (mockFetch as unknown as ReturnType<typeof mock>).mock.calls[0][0],
    ).toBe('https://index.trygravity.ai/services?category=Email&q=send')
    const [, init] = (mockFetch as unknown as ReturnType<typeof mock>).mock
      .calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ 'X-API-Key': 'gravity-key' })
  })

  test('list_categories maps to GET /categories', async () => {
    mockFetch = Object.assign(
      mock(async () => Response.json({ categories: [], total: 0 })),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ action: 'list_categories' }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(200)
    expect(
      (mockFetch as unknown as ReturnType<typeof mock>).mock.calls[0][0],
    ).toBe('https://index.trygravity.ai/categories')
  })

  test('get_service maps to GET /services/{slug}', async () => {
    mockFetch = Object.assign(
      mock(async () => Response.json({ name: 'SendGrid', slug: 'sendgrid' })),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ action: 'get_service', slug: 'sendgrid' }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(200)
    expect(
      (mockFetch as unknown as ReturnType<typeof mock>).mock.calls[0][0],
    ).toBe('https://index.trygravity.ai/services/sendgrid')
  })

  test('report_integration maps to POST /integrations/report', async () => {
    mockFetch = Object.assign(
      mock(async () =>
        Response.json({ status: 'converted', slug: 'sendgrid' }),
      ),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({
        action: 'report_integration',
        search_id: 'search-1',
        integrated_slug: 'sendgrid',
        external_session_id: 'session-1',
        metadata: { surface: 'test' },
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(200)
    const [, init] = (mockFetch as unknown as ReturnType<typeof mock>).mock
      .calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      search_id: 'search-1',
      integrated_slug: 'sendgrid',
      external_session_id: 'session-1',
      external_user_id_hash: sha256('user-1'),
      email_hash: sha256('user@example.com'),
      metadata: { surface: 'test' },
    })
  })

  test('502 when Gravity upstream fails', async () => {
    mockFetch = Object.assign(
      mock(async () =>
        Response.json({ error: 'bad request' }, { status: 400 }),
      ),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({
        action: 'search',
        query: 'transactional email',
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'bad request' })
  })

  test('redacts Gravity API key from upstream error responses and logs', async () => {
    mockFetch = Object.assign(
      mock(
        async () =>
          new Response(
            JSON.stringify({
              detail: [
                {
                  input: {
                    query: '',
                    api_key: 'gravity-key',
                  },
                },
              ],
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
      { preconnect: () => {} },
    ) as typeof fetch
    const req = new NextRequest('http://localhost:3000/api/v1/gravity-index', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({
        action: 'search',
        query: 'transactional email',
      }),
    })

    const res = await postGravityIndex({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
      fetch: mockFetch,
      serverEnv: testServerEnv,
    })

    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('gravity-key')
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('gravity-key')
    expect(JSON.stringify(mockWarn.mock.calls)).toContain('[redacted]')
  })
})
