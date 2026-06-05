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
  test('keeps existing choice placements for half of users', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'a',
      requestUserAgent: 'Freebuff-CLI/0.0.88',
    })

    expect(body.placements).toEqual([
      { placement: 'below_response', placement_id: 'choice-ad-1' },
      { placement: 'below_response', placement_id: 'choice-ad-2' },
      { placement: 'below_response', placement_id: 'choice-ad-3' },
      { placement: 'below_response', placement_id: 'choice-ad-4' },
    ])
  })

  test('uses the single-ad placement for half of users', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'b',
      requestUserAgent: 'Freebuff-CLI/0.0.88',
    })

    expect(body.placements).toEqual([
      { placement: 'below_response', placement_id: 'Single-Ad-Unit-1' },
    ])
  })

  test('buckets Codebuff CLI users into the experiment alongside Freebuff CLI', async () => {
    const codebuffBody = await fetchGravityRequestBody({
      userId: 'b',
      requestUserAgent: 'Codebuff-CLI/0.0.88',
    })
    expect(codebuffBody.placements).toEqual([
      { placement: 'below_response', placement_id: 'Single-Ad-Unit-1' },
    ])
  })

  test('does not apply the single-ad experiment to the waiting room surface', async () => {
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
      email: 'User@Example.com',
      emailHash:
        'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
      userId: 'browser-user-id',
    })
  })
})
