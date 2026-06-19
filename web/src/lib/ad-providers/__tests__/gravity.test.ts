import { describe, expect, test } from 'bun:test'

import { createGravityProvider } from '../gravity'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { FetchAdInput } from '../types'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

async function fetchGravityRequestBody(
  overrides: Partial<FetchAdInput>,
): Promise<Record<string, unknown>> {
  const provider = createGravityProvider({ apiKey: 'gravity-key' })
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return Response.json([
        {
          adText: 'Ad copy',
          title: 'Acme',
          cta: 'Try it',
          url: 'https://example.com',
          favicon: 'https://example.com/favicon.ico',
          clickUrl: 'https://example.com/click',
          impUrl: 'https://example.com/imp',
        },
      ])
    },
    { preconnect: () => {} },
  ) as typeof globalThis.fetch

  await provider.fetchAd({
    userId: 'a',
    userEmail: 'user@example.com',
    messages: [],
    testMode: false,
    logger,
    fetch,
    ...overrides,
  })

  expect(requests).toHaveLength(1)
  return JSON.parse(String(requests[0]!.init?.body))
}

describe('Gravity ad provider', () => {
  test('serves the single chat ad to all users', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'a',
      requestUserAgent: 'Freebuff-CLI/0.0.88',
    })

    expect(body.placements).toEqual([
      { placement: 'below_response', placement_id: 'Single-Ad-Unit-1' },
    ])
  })

  test('serves the single chat ad to Codebuff CLI users too', async () => {
    const codebuffBody = await fetchGravityRequestBody({
      userId: 'b',
      requestUserAgent: 'Codebuff-CLI/0.0.88',
    })
    expect(codebuffBody.placements).toEqual([
      { placement: 'below_response', placement_id: 'Single-Ad-Unit-1' },
    ])
  })

  test('uses the waiting room placements for the waiting room surface', async () => {
    const waitingRoomBody = await fetchGravityRequestBody({
      userId: 'b',
      requestUserAgent: 'Freebuff-CLI/0.0.88',
      surface: 'waiting_room',
    })
    expect(waitingRoomBody.placements).toEqual([
      { placement: 'below_response', placement_id: 'waiting-room-1' },
      { placement: 'below_response', placement_id: 'waiting-room-2' },
      { placement: 'below_response', placement_id: 'waiting-room-3' },
      { placement: 'below_response', placement_id: 'waiting-room-4' },
    ])
  })

  test('requests both Freebuff Web chat placements in one auction', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'b',
      surface: 'freebuff_web_chat',
    })

    expect(body.placements).toEqual([
      {
        placement: 'inline_response',
        placement_id: 'Web-Chat-After-User-Message',
      },
      {
        placement: 'inline_response',
        placement_id: 'Web-Chat-After-Assistant-Message',
      },
    ])
  })

  test('requests the single chat assistant placement for the chat assistant surface', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'b',
      surface: 'chat_assistant',
    })

    expect(body.placements).toEqual([
      {
        placement: 'inline_response',
        placement_id: 'Chat-Assistant-Above-Input',
      },
    ])
  })

  test('requests explicit top page placement for Above-iFrame', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'b',
      surface: 'freebuff_web_chat',
      placementId: 'Above-iFrame',
    })

    expect(body.placements).toEqual([
      {
        placement: 'top_page',
        placement_id: 'Above-iFrame',
      },
    ])
  })

  test('passes browser Gravity context with server-trusted user and device data', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'server-user-id',
      userEmail: 'User@Example.com',
      sessionId: 'fallback-session',
      clientIp: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
      device: {
        timezone: 'America/Los_Angeles',
        locale: 'en-US',
      },
      gravityContext: {
        sessionId: 'browser-session',
        user: {
          userId: 'browser-user-id',
          email: 'browser@example.com',
          phone: '+15555550123',
        },
        device: {
          screenWidth: 1440,
          screenHeight: 900,
          timezone: 'UTC',
          locale: 'en-GB',
        },
      },
    })

    expect(body.sessionId).toBe('browser-session')
    expect(body.gravity_context).toEqual({
      sessionId: 'browser-session',
      user: {
        userId: 'browser-user-id',
      },
      device: {
        screenWidth: 1440,
        screenHeight: 900,
        timezone: 'UTC',
        locale: 'en-GB',
      },
    })
    expect(body.device).toMatchObject({
      ip: '203.0.113.10',
      ua: 'Mozilla/5.0',
      userAgent: 'Mozilla/5.0',
      screenWidth: 1440,
      screenHeight: 900,
      timezone: 'America/Los_Angeles',
      locale: 'en-US',
    })
    expect(body.user).toMatchObject({
      id: 'server-user-id',
      uid: 'server-user-id',
      hashed_email:
        'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
      userId: 'browser-user-id',
    })
    expect((body.user as Record<string, unknown>).email).toBeUndefined()
    expect((body.user as Record<string, unknown>).phone).toBeUndefined()
  })
})
