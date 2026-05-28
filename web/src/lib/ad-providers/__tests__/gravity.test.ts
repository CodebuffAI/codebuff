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
  test('keeps existing choice placements for half of Freebuff CLI users', async () => {
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

  test('uses the single-ad placement for half of Freebuff CLI users', async () => {
    const body = await fetchGravityRequestBody({
      userId: 'b',
      requestUserAgent: 'Freebuff-CLI/0.0.88',
    })

    expect(body.placements).toEqual([
      { placement: 'below_response', placement_id: 'Single-Ad-Unit-1' },
    ])
  })

  test('does not apply the single-ad experiment outside Freebuff CLI chat', async () => {
    const codebuffBody = await fetchGravityRequestBody({
      userId: 'b',
      requestUserAgent: 'Codebuff-CLI/0.0.88',
    })
    expect(codebuffBody.placements).toHaveLength(4)

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
})
