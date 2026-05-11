import { describe, expect, test } from 'bun:test'

import { createZeroClickProvider } from '../zeroclick'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('ZeroClick ad provider', () => {
  test('uses content as ad text and stores brand name as title', async () => {
    const provider = createZeroClickProvider({ apiKey: 'test-key' })
    const fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'offer-1',
              title:
                'Long product title that should not be used as the display label',
              subtitle: 'Subtitle that should not be included',
              content: 'Main offer description.',
              cta: 'Try it',
              clickUrl: 'https://zeroclick.example/click',
              brand: {
                name: 'Acme',
                url: null,
                iconUrl: 'https://example.com/icon.png',
              },
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      { preconnect: () => {} },
    ) as typeof globalThis.fetch

    const result = await provider.fetchAd({
      userId: 'user-1',
      userEmail: 'user@example.com',
      clientIp: '127.0.0.1',
      messages: [],
      testMode: true,
      logger,
      fetch,
    })

    expect(result?.ads).toHaveLength(1)
    expect(result?.ads[0]).toMatchObject({
      adText: 'Main offer description.',
      title: 'Acme',
      cta: 'Try it',
      url: '',
      favicon: 'https://example.com/icon.png',
      clickUrl: 'https://zeroclick.example/click',
      impressionIds: ['offer-1'],
    })
  })

  test('uses subtitle as ad text fallback when content is missing', async () => {
    const provider = createZeroClickProvider({ apiKey: 'test-key' })
    const fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 'offer-1',
              title: 'Long product title',
              subtitle: 'Fallback subtitle description.',
              content: null,
              cta: 'Try it',
              clickUrl: 'https://zeroclick.example/click',
              brand: { name: 'Acme' },
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      { preconnect: () => {} },
    ) as typeof globalThis.fetch

    const result = await provider.fetchAd({
      userId: 'user-1',
      userEmail: 'user@example.com',
      clientIp: '127.0.0.1',
      messages: [],
      testMode: true,
      logger,
      fetch,
    })

    expect(result?.ads[0]?.adText).toBe('Fallback subtitle description.')
  })
})
