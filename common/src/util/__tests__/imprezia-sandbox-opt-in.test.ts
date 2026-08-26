import { describe, expect, test } from 'bun:test'

import { fetchImpreziaChatAd } from '../imprezia-client'

import type { Logger } from '../../types/contracts/logger'

const SANDBOX_KEY = 'api_pub_sandbox_abc123'
const PROD_KEY = 'api_pub_prod_abc123'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const ad = {
  creative: {
    brandName: 'Imprezia',
    title: 'Developers. Earn money with your AI app.',
    description: 'Run ads like this, and get paid.',
    cta: 'Sponsored',
  },
  clickUrl: 'https://go-sandbox.imprezia.ai/go/tok',
  impression: {
    impressionUuid: 'uuid-1',
    beaconToken: { token: 't', issuedAt: 1, kid: 'k' },
    servedAt: '2026-08-22T23:47:09.005Z',
    publisherId: 'pub-1',
  },
}

const request = {
  request: 'how do i cache api responses?',
  response: 'use a Map with a TTL, or Redis across processes.',
  sessionId: 's1',
  timestamp: '2026-08-22T23:35:00.000Z',
  sourceUrl: 'https://freebuff.com/chat',
  surface: 'chat' as const,
  platformString: 'browser',
  deviceContext: {
    deviceType: 'desktop' as const,
    viewportWidth: 1280,
    viewportHeight: 800,
  },
}

/** Also counts upstream calls, so a refusal can be shown to happen first. */
const call = (opts: {
  apiKey: string
  testMode: boolean
  allowSandbox?: boolean
}) => {
  let upstreamCalls = 0
  const fetch = (async () => {
    upstreamCalls += 1
    return new Response(JSON.stringify({ requestId: 'req_1', ad }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof globalThis.fetch

  return fetchImpreziaChatAd({
    ...opts,
    request,
    userAgent: 'UA',
    logger,
    fetch,
  }).then((result) => ({ result, upstreamCalls }))
}

/**
 * The sandbox key serves Imprezia's own house ad, which renders exactly like
 * paid inventory. A passer-by could not tell it from a real advertiser, so it
 * stays refused unless the session asked for this network by name.
 */
describe('sandbox creatives in production', () => {
  test('are refused, without even calling upstream', async () => {
    const { result, upstreamCalls } = await call({
      apiKey: SANDBOX_KEY,
      testMode: false,
    })
    expect(result).toBeNull()
    // Refusing before the request also keeps test impressions off Imprezia's
    // ledger, not just off the page.
    expect(upstreamCalls).toBe(0)
  })

  test('are served to a session that asked for this network', async () => {
    const { result } = await call({
      apiKey: SANDBOX_KEY,
      testMode: false,
      allowSandbox: true,
    })
    expect(result?.ad?.creative.brandName).toBe('Imprezia')
  })

  test('the opt-in is irrelevant to a production key', async () => {
    for (const allowSandbox of [undefined, true]) {
      const { result } = await call({
        apiKey: PROD_KEY,
        testMode: false,
        allowSandbox,
      })
      expect(result?.ad).toBeTruthy()
    }
  })

  /**
   * A misconfigured key is true of every request until someone changes it, so
   * logging the refusal per call scales with TRAFFIC: it produced 1.3M error
   * rows in a day and hid every real error on the service. It still has to be
   * findable, so the first one stays at error level.
   */
  test('announce the refusal once per process, not once per request', async () => {
    const levels: string[] = []
    const counting: Logger = {
      debug: () => levels.push('debug'),
      info: () => levels.push('info'),
      warn: () => levels.push('warn'),
      error: () => levels.push('error'),
    }
    const fetch = (async () =>
      new Response(JSON.stringify({ requestId: 'req_1', ad }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch

    for (let i = 0; i < 5; i += 1) {
      await fetchImpreziaChatAd({
        apiKey: SANDBOX_KEY,
        testMode: false,
        request,
        userAgent: 'UA',
        logger: counting,
        fetch,
      })
    }

    // Another module in this suite may already have burned the once-per-process
    // error, so assert the SHAPE: at most one error, and never a second.
    expect(levels.filter((l) => l === 'error').length).toBeLessThanOrEqual(1)
    expect(levels.length).toBe(5)
    expect(levels.filter((l) => l === 'debug').length).toBeGreaterThanOrEqual(4)
  })
})
