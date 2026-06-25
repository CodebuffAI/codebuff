import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'

const insertedRows: unknown[] = []

const onConflictDoNothingMock = mock(() => Promise.resolve())
const valuesMock = mock((row: unknown) => {
  insertedRows.push(row)
  return { onConflictDoNothing: onConflictDoNothingMock }
})
const insertMock = mock(() => ({ values: valuesMock }))

mock.module('@codebuff/internal/db', () => ({
  default: {
    insert: insertMock,
  },
}))

mock.module('@codebuff/internal/db/schema', () => ({
  adImpression: {},
}))

const { postAds } = await import('../_post')

describe('/api/v1/ads POST endpoint', () => {
  let logger: Logger
  let loggerWithContext: LoggerWithContextFn
  let trackEvent: TrackEventFn

  const getUserInfoFromApiKey: GetUserInfoFromApiKeyFn = async ({ apiKey }) => {
    if (apiKey !== 'test-key') return null
    return {
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
    } as Awaited<ReturnType<GetUserInfoFromApiKeyFn>>
  }

  beforeEach(() => {
    insertedRows.length = 0
    insertMock.mockClear()
    valuesMock.mockClear()
    onConflictDoNothingMock.mockClear()

    logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    loggerWithContext = mock(() => logger)
    trackEvent = mock(() => {})
  })

  afterAll(() => {
    mock.restore()
  })

  function createRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/v1/ads', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
        'User-Agent': 'CodebuffCLI/1.0',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: JSON.stringify(body),
    })
  }

  test('falls back from Gravity to Carbon in the waiting room', async () => {
    const upstreamUrls: string[] = []
    const fetchMock = mock(
      async (url: string | URL | Request): Promise<Response> => {
        const urlString = String(url)
        upstreamUrls.push(urlString)

        if (urlString.includes('server.trygravity.ai')) {
          return new Response(null, { status: 204 })
        }

        if (urlString.includes('srv.buysellads.com')) {
          return Response.json({
            ads: [
              {
                statlink: '//srv.buysellads.com/click',
                statimp: '//srv.buysellads.com/imp',
                description: 'Carbon fallback ad',
                company: 'Carbon Co',
                callToAction: 'Try it',
                image: 'https://example.com/carbon.png',
              },
            ],
          })
        }

        return new Response('unexpected upstream', { status: 500 })
      },
    )

    const response = await postAds({
      req: createRequest({
        provider: 'gravity',
        messages: [],
        sessionId: 'session-123',
        userAgent: 'Mozilla/5.0',
        surface: 'waiting_room',
      }),
      getUserInfoFromApiKey,
      logger,
      loggerWithContext,
      trackEvent,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      serverEnv: {
        GRAVITY_API_KEY: 'gravity-key',
        CARBON_ZONE_KEY: 'carbon-zone',
        CB_ENVIRONMENT: 'prod',
      },
    })

    expect(response.status).toBe(200)
    expect(upstreamUrls[0]).toContain('server.trygravity.ai')
    expect(upstreamUrls[1]).toContain('srv.buysellads.com')

    const body = await response.json()
    expect(body.provider).toBe('carbon')
    expect(body.ads).toHaveLength(1)
    expect(body.ads[0]).toMatchObject({
      adText: 'Carbon fallback ad',
      title: 'Carbon Co',
      clickUrl: 'https://srv.buysellads.com/click',
      impUrl: 'https://srv.buysellads.com/imp',
    })

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({
      user_id: 'user-123',
      provider: 'carbon',
      ad_text: 'Carbon fallback ad',
      imp_url: 'https://srv.buysellads.com/imp',
    })
  })

  test('skips unconfigured providers and still reaches Carbon', async () => {
    const upstreamUrls: string[] = []
    const fetchMock = mock(
      async (url: string | URL | Request): Promise<Response> => {
        const urlString = String(url)
        upstreamUrls.push(urlString)

        if (urlString.includes('server.trygravity.ai')) {
          return new Response(null, { status: 204 })
        }

        if (urlString.includes('srv.buysellads.com')) {
          return Response.json({
            ads: [
              {
                statlink: '//srv.buysellads.com/click',
                statimp: '//srv.buysellads.com/imp',
                description: 'Carbon fallback ad',
                company: 'Carbon Co',
              },
            ],
          })
        }

        return new Response('unexpected upstream', { status: 500 })
      },
    )

    const response = await postAds({
      req: createRequest({
        provider: 'gravity',
        messages: [],
        userAgent: 'Mozilla/5.0',
        surface: 'waiting_room',
      }),
      getUserInfoFromApiKey,
      logger,
      loggerWithContext,
      trackEvent,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      serverEnv: {
        GRAVITY_API_KEY: 'gravity-key',
        CARBON_ZONE_KEY: 'carbon-zone',
        CB_ENVIRONMENT: 'prod',
      },
    })

    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.provider).toBe('carbon')
    expect(body.ads).toHaveLength(1)
  })

  test.each([
    ['agent chat (no surface)', undefined],
    ['web chat', 'freebuff_web_chat'],
    ['chat assistant', 'chat_assistant'],
  ] as const)(
    '%s only queries Gravity, returning no ads on no fill',
    async (_name, surface) => {
      const upstreamUrls: string[] = []
      const fetchMock = mock(
        async (url: string | URL | Request): Promise<Response> => {
          const urlString = String(url)
          upstreamUrls.push(urlString)

          if (urlString.includes('server.trygravity.ai')) {
            return new Response(null, { status: 204 })
          }

          return new Response('unexpected upstream', { status: 500 })
        },
      )

      const response = await postAds({
        req: createRequest({
          provider: 'gravity',
          messages: [],
          sessionId: 'session-123',
          userAgent: 'Mozilla/5.0',
          ...(surface ? { surface } : {}),
        }),
        getUserInfoFromApiKey,
        logger,
        loggerWithContext,
        trackEvent,
        fetch: fetchMock as unknown as typeof globalThis.fetch,
        serverEnv: {
          GRAVITY_API_KEY: 'gravity-key',
          CARBON_ZONE_KEY: 'carbon-zone',
          CB_ENVIRONMENT: 'prod',
        },
      })

      expect(response.status).toBe(200)
      expect(upstreamUrls).toHaveLength(1)
      expect(upstreamUrls[0]).toContain('server.trygravity.ai')

      const body = await response.json()
      expect(body.provider).toBe('gravity')
      expect(body.ads).toHaveLength(0)
      expect(insertedRows).toHaveLength(0)
    },
  )
})
