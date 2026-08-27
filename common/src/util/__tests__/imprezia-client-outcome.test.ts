import { describe, expect, test } from 'bun:test'

import { fetchImpreziaChatAd } from '../imprezia-client'

import type { Logger } from '../../types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const request = {
  request: 'How do I cache API responses?',
  response: 'Use a cache with an expiry.',
  sessionId: 'session-1',
  timestamp: '2026-08-27T00:00:00.000Z',
  sourceUrl: 'https://freebuff.com/chat',
  surface: 'chat' as const,
  platformString: 'browser',
  deviceContext: {
    deviceType: 'desktop' as const,
    viewportWidth: 1280,
    viewportHeight: 800,
  },
}

const ad = {
  creative: {
    brandName: 'Sponsor',
    title: 'A useful product',
    description: 'A short description',
    cta: 'Learn more',
  },
  clickUrl: 'https://example.com/click',
  impression: {
    impressionUuid: 'impression-1',
    servedAt: '2026-08-27T00:00:00.000Z',
    publisherId: 'publisher-1',
  },
}

function call(
  fetch: typeof globalThis.fetch,
  onOutcome?: (outcome: string) => void,
  signal?: AbortSignal,
) {
  return fetchImpreziaChatAd({
    apiKey: 'api_pub_prod_test',
    request,
    userAgent: 'Mozilla/5.0',
    testMode: true,
    logger,
    fetch,
    onOutcome,
    signal,
  })
}

describe('fetchImpreziaChatAd outcome observer', () => {
  test('reports a fill without changing the filled result', async () => {
    const outcomes: string[] = []
    const result = await call(
      (async () =>
        new Response(JSON.stringify({ requestId: 'request-1', ad }), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
      (outcome) => outcomes.push(outcome),
    )

    expect(result?.ad?.creative.brandName).toBe('Sponsor')
    expect(outcomes).toEqual(['fill'])
  })

  test('reports both body and empty-response no-fills', async () => {
    const bodyOutcomes: string[] = []
    const bodyResult = await call(
      (async () =>
        new Response(JSON.stringify({ requestId: 'request-1', ad: null }), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
      (outcome) => bodyOutcomes.push(outcome),
    )
    expect(bodyResult).toEqual({ requestId: 'request-1', ad: null })
    expect(bodyOutcomes).toEqual(['no_fill'])

    const emptyOutcomes: string[] = []
    const emptyResult = await call(
      (async () =>
        new Response(null, {
          status: 204,
        })) as unknown as typeof globalThis.fetch,
      (outcome) => emptyOutcomes.push(outcome),
    )
    expect(emptyResult).toBeNull()
    expect(emptyOutcomes).toEqual(['no_fill'])
  })

  test('reports timeout, HTTP, and schema failures as bounded outcomes', async () => {
    const timeoutError = new Error('timed out')
    timeoutError.name = 'AbortError'
    const timeoutOutcomes: string[] = []
    expect(
      await call(
        (async () => {
          throw timeoutError
        }) as unknown as typeof globalThis.fetch,
        (outcome) => timeoutOutcomes.push(outcome),
      ),
    ).toBeNull()
    expect(timeoutOutcomes).toEqual(['timeout'])

    const httpOutcomes: string[] = []
    expect(
      await call(
        (async () =>
          new Response(null, {
            status: 403,
          })) as unknown as typeof globalThis.fetch,
        (outcome) => httpOutcomes.push(outcome),
      ),
    ).toBeNull()
    expect(httpOutcomes).toEqual(['provider_error'])

    const schemaOutcomes: string[] = []
    expect(
      await call(
        (async () =>
          new Response(
            JSON.stringify({ unexpected: true }),
          )) as unknown as typeof globalThis.fetch,
        (outcome) => schemaOutcomes.push(outcome),
      ),
    ).toBeNull()
    expect(schemaOutcomes).toEqual(['provider_error'])
  })

  test('treats a caller abort as a timeout without exposing its reason', async () => {
    const controller = new AbortController()
    const outcomes: string[] = []
    const result = call(
      (async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error(String(controller.signal.reason))),
            { once: true },
          )
        })) as typeof globalThis.fetch,
      (outcome) => outcomes.push(outcome),
      controller.signal,
    )

    controller.abort('do-not-leak-this-cancellation-reason')

    expect(await result).toBeNull()
    expect(outcomes).toEqual(['timeout'])
  })

  test('keeps callers backward compatible when no observer is supplied or it fails', async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ requestId: 'request-1', ad: null }), {
        status: 200,
      })) as unknown as typeof globalThis.fetch

    expect(await call(fetch)).toEqual({ requestId: 'request-1', ad: null })
    expect(
      await call(fetch, () => {
        throw new Error('telemetry unavailable')
      }),
    ).toEqual({ requestId: 'request-1', ad: null })
  })
})
