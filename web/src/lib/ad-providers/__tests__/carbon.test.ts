import { describe, expect, test } from 'bun:test'

import { createCarbonProvider } from '../carbon'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('Carbon ad provider', () => {
  test('sends the CLI User-Agent as the HTTP header', async () => {
    const provider = createCarbonProvider({ zoneKey: 'CVADC53U' })
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetch = Object.assign(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init })
        return new Response(
          JSON.stringify({
            ads: [
              {
                statlink: '//srv.buysellads.com/click',
                statimp: '//srv.buysellads.com/imp',
                description: 'Ad copy',
                company: 'Acme',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
      { preconnect: () => {} },
    ) as typeof globalThis.fetch

    const result = await provider.fetchAd({
      userId: 'user-1',
      userEmail: 'user@example.com',
      clientIp: '203.0.113.1',
      userAgent: 'Mozilla/5.0 Test Browser',
      requestUserAgent: 'Freebuff-CLI/0.0.88',
      messages: [],
      testMode: false,
      logger,
      fetch,
    })

    expect(result?.ads).toHaveLength(1)
    expect(requests).toHaveLength(4)
    for (const request of requests) {
      expect(request.url).toContain('useragent=Mozilla%2F5.0+Test+Browser')
      expect(request.init?.headers).toEqual({
        'User-Agent': 'Freebuff-CLI/0.0.88',
      })
    }
  })
})
