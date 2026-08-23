import { describe, expect, test } from 'bun:test'

import {
  fetchImpreziaChatAd,
  isImpreziaSandboxTester,
} from '../imprezia-client'

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

/** Records whether the upstream API was called at all. */
function countingFetch() {
  let calls = 0
  const fetch = (async () => {
    calls += 1
    return new Response(JSON.stringify({ requestId: 'req_1', ad }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls: () => calls }
}

const request = {
  request: 'how do i cache api responses?',
  response: 'use a Map with a TTL, or Redis across processes.',
  sessionId: 's1',
  timestamp: '2026-08-22T23:35:00.000Z',
  sourceUrl: 'https://freebuff.com/chat',
  platformString: 'browser',
  deviceContext: {
    deviceType: 'desktop' as const,
    viewportWidth: 1280,
    viewportHeight: 800,
  },
}

const call = (opts: {
  apiKey: string
  testMode: boolean
  allowSandbox?: boolean
}) => {
  const { fetch, calls } = countingFetch()
  return fetchImpreziaChatAd({
    ...opts,
    request,
    userAgent: 'UA',
    logger,
    fetch,
  }).then((result) => ({ result, upstreamCalls: calls() }))
}

/**
 * The sandbox key serves Imprezia's own house ad, which renders exactly like
 * paid inventory. Letting one reach an ordinary production user would put an
 * ad for our ad vendor in the slot, indistinguishable from a real advertiser.
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

  test('are served when a caller explicitly opts in', async () => {
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
})

/**
 * The allowlist is one of two gates. The other -- that the session pinned
 * `?ads=imprezia` -- lives in the route, because only the client knows it.
 */
describe('isImpreziaSandboxTester', () => {
  const allowlist = 'tester@imprezia.ai, Second.Tester@Imprezia.AI'

  test('admits a listed tester, case- and space-insensitively', () => {
    expect(
      isImpreziaSandboxTester({ email: 'tester@imprezia.ai', allowlist }),
    ).toBe(true)
    // The list is pasted in by hand, and so is the account email.
    expect(
      isImpreziaSandboxTester({
        email: ' Second.Tester@imprezia.ai ',
        allowlist,
      }),
    ).toBe(true)
  })

  test('refuses anyone not on the list, exactly', () => {
    // Exact match, not substring: a lookalike domain must not slip through if
    // someone later "optimizes" this into an includes() scan.
    for (const email of [
      'someone@else.com',
      'tester@imprezia.ai.evil.com',
      'xtester@imprezia.ai',
      'tester@imprezia.aiX',
    ]) {
      expect(isImpreziaSandboxTester({ email, allowlist })).toBe(false)
    }
  })

  test('an unset allowlist admits nobody', () => {
    // The safe default: if the env var is never created, production behaves
    // exactly as it does with no allowlist feature at all.
    for (const value of [undefined, null, '', '   ', ',,']) {
      expect(
        isImpreziaSandboxTester({
          email: 'tester@imprezia.ai',
          allowlist: value,
        }),
      ).toBe(false)
    }
  })

  test('a session with no email is never a tester', () => {
    for (const email of [null, undefined, '']) {
      expect(isImpreziaSandboxTester({ email, allowlist })).toBe(false)
    }
  })

  test('a blank email never matches a blank list entry', () => {
    // The fail-open this boundary is one line away from: a trailing comma or
    // an empty env value yields an empty entry, and a whitespace-only email
    // normalizes to empty too. Dropping the .filter(Boolean) that removes
    // those entries makes every one of these return true.
    for (const [email, list] of [
      ['   ', 'tester@imprezia.ai,'],
      ['   ', ''],
      ['\t\n', ',,'],
      [' ', ' , tester@imprezia.ai '],
    ]) {
      expect(isImpreziaSandboxTester({ email, allowlist: list })).toBe(false)
    }
  })
})
