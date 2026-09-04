import { afterEach, describe, expect, test } from 'bun:test'

import {
  FREEBUFF_EVENT_ID_HEADER,
  FREEBUFF_RENDER_DELAY_HEADER,
} from './ad-event-hygiene'
import {
  acknowledgeFirstPartyView,
  FIRST_PARTY_VIEW_ACK_MAX_DURATION_MS,
  FIRST_PARTY_VIEW_ACK_TIMEOUT_MS,
  getCompletedFirstPartyViewAckTokenCountForTests,
  MAX_COMPLETED_FIRST_PARTY_VIEW_ACK_TOKENS,
  resetFirstPartyViewAckRegistryForTests,
} from './first-party-view-ack'

afterEach(resetFirstPartyViewAckRegistryForTests)

const request = (
  overrides: Partial<Parameters<typeof acknowledgeFirstPartyView>[0]> = {},
) => ({
  token: 'opaque-token',
  url: '/api/ads/first-party/impression/opaque-token',
  surface: 'waiting_room',
  placementId: 'waiting-room-1',
  clientFamily: 'cli' as const,
  ...overrides,
})

describe('acknowledgeFirstPartyView', () => {
  test('retries a 5xx with the same request and browser keepalive', async () => {
    const calls: RequestInit[] = []
    const outcomes: string[] = []
    let count = 0
    await acknowledgeFirstPartyView(
      request({
        init: { method: 'POST', body: '{"immutable":true}' },
        keepalive: true,
        fetch: async (_url, init) => {
          calls.push(init!)
          count++
          return count === 1
            ? new Response(null, { status: 503 })
            : new Response(null, { status: 204 })
        },
        onAttempt: ({ outcome }) => outcomes.push(outcome),
      }),
    )
    expect(calls).toHaveLength(2)
    expect(
      calls.every(
        (call) => call.keepalive === true && call.body === '{"immutable":true}',
      ),
    ).toBe(true)
    expect(outcomes).toEqual(['server_error', 'accepted'])
  })

  test('does not retry 4xx responses, including rate limits', async () => {
    let calls = 0
    const outcomes: string[] = []
    await acknowledgeFirstPartyView(
      request({
        fetch: async () => {
          calls++
          return new Response(null, { status: 429 })
        },
        onAttempt: ({ outcome }) => outcomes.push(outcome),
      }),
    )
    expect(calls).toBe(1)
    expect(outcomes).toEqual(['client_error'])
  })

  test('recognizes an idempotent acknowledgement and coalesces remounts', async () => {
    let calls = 0
    const fetch = async () => {
      calls++
      return Response.json({ alreadyRecorded: true })
    }
    await Promise.all([
      acknowledgeFirstPartyView(request({ fetch })),
      acknowledgeFirstPartyView(request({ fetch })),
    ])
    await acknowledgeFirstPartyView(request({ fetch }))
    expect(calls).toBe(1)
  })

  test('retries network failures at exactly 250ms then 1s and caps at three attempts', async () => {
    const delays: number[] = []
    const outcomes: string[] = []
    let calls = 0
    await acknowledgeFirstPartyView(
      request({
        fetch: async () => {
          calls++
          throw new Error('offline')
        },
        sleep: async (ms) => void delays.push(ms),
        onAttempt: ({ outcome }) => outcomes.push(outcome),
      }),
    )
    expect(calls).toBe(3)
    expect(delays).toEqual([250, 1000])
    expect(outcomes).toEqual([
      'network_error',
      'network_error',
      'network_error',
    ])
  })

  test('reports cumulative duration across retries and stops once accepted', async () => {
    const durations: number[] = []
    let now = 100
    let calls = 0
    await acknowledgeFirstPartyView(
      request({
        now: () => now,
        fetch: async () => {
          calls++
          now += 40
          return calls === 1
            ? new Response(null, { status: 502 })
            : new Response(null, { status: 204 })
        },
        sleep: async (ms) => {
          now += ms
        },
        onAttempt: ({ duration_ms }) => durations.push(duration_ms),
      }),
    )
    expect(calls).toBe(2)
    expect(durations).toEqual([40, 330])
  })

  test('clamps delayed client scheduling instead of dropping a valid terminal event', async () => {
    const durations: number[] = []
    let now = 0
    await acknowledgeFirstPartyView(
      request({
        now: () => now,
        fetch: async () => {
          now = FIRST_PARTY_VIEW_ACK_MAX_DURATION_MS + 5_000
          return new Response(null, { status: 204 })
        },
        onAttempt: ({ duration_ms }) => durations.push(duration_ms),
      }),
    )
    expect(durations).toEqual([FIRST_PARTY_VIEW_ACK_MAX_DURATION_MS])
  })

  test('uses the two-second timeout policy and classifies aborted requests as timeout', async () => {
    const outcomes: string[] = []
    await acknowledgeFirstPartyView(
      request({
        attemptTimeoutMs: 1,
        fetch: async (_url, init) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
        sleep: async () => {},
        onAttempt: ({ outcome }) => outcomes.push(outcome),
      }),
    )
    expect(outcomes).toEqual(['timeout', 'timeout', 'timeout'])
    expect(FIRST_PARTY_VIEW_ACK_TIMEOUT_MS).toBe(2_000)
  })

  test('reads a browser acknowledgement outcome header and ignores telemetry exceptions', async () => {
    const outcomes: string[] = []
    await acknowledgeFirstPartyView(
      request({
        fetch: async () =>
          new Response(null, {
            status: 204,
            headers: { 'X-Freebuff-Ack-Outcome': 'deduped' },
          }),
        onAttempt: ({ outcome }) => {
          outcomes.push(outcome)
          throw new Error('telemetry unavailable')
        },
      }),
    )
    expect(outcomes).toEqual(['deduped'])
  })

  test('bounds completed tokens while retaining recent-token remount coalescing', async () => {
    let calls = 0
    const fetch = async () => {
      calls++
      return new Response(null, { status: 204 })
    }
    for (
      let index = 0;
      index <= MAX_COMPLETED_FIRST_PARTY_VIEW_ACK_TOKENS;
      index++
    ) {
      await acknowledgeFirstPartyView(
        request({ token: `token-${index}`, fetch }),
      )
    }

    expect(getCompletedFirstPartyViewAckTokenCountForTests()).toBe(
      MAX_COMPLETED_FIRST_PARTY_VIEW_ACK_TOKENS,
    )
    await acknowledgeFirstPartyView(
      request({
        token: `token-${MAX_COMPLETED_FIRST_PARTY_VIEW_ACK_TOKENS}`,
        fetch,
      }),
    )
    expect(calls).toBe(MAX_COMPLETED_FIRST_PARTY_VIEW_ACK_TOKENS + 1)
  })

  // COD-365: one id per LOGICAL event, so the server can tell a retry that
  // lost a race from a fresh acknowledgement. Captured once with the rest of
  // the request, so every attempt carries the same value for free.
  test('sends one X-Freebuff-Event-Id on every attempt and reports it', async () => {
    const seen: string[] = []
    const observations: { client_event_id?: string; sample_rate?: number }[] =
      []
    let count = 0
    await acknowledgeFirstPartyView(
      request({
        init: {
          method: 'POST',
          headers: {
            Authorization: 'Bearer t',
            'Content-Type': 'application/json',
          },
        },
        renderDelayMs: 1234.4,
        sleep: async () => {},
        fetch: async (_url, init) => {
          const headers = new Headers(init?.headers)
          seen.push(headers.get(FREEBUFF_EVENT_ID_HEADER)!)
          expect(headers.get('authorization')).toBe('Bearer t')
          expect(headers.get(FREEBUFF_RENDER_DELAY_HEADER)).toBe('1234')
          count++
          return count < 3
            ? new Response(null, { status: 503 })
            : new Response(null, { status: 204 })
        },
        onAttempt: (observation) => observations.push(observation),
      }),
    )
    expect(seen).toHaveLength(3)
    expect(new Set(seen).size).toBe(1)
    expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(observations.map((o) => o.client_event_id)).toEqual(seen)
    expect(observations.every((o) => o.sample_rate === 1)).toBe(true)
  })

  test('honours a caller-minted id and omits the delay header when unmeasured', async () => {
    let headers: Headers | undefined
    await acknowledgeFirstPartyView(
      request({
        clientEventId: 'caller-minted-id',
        fetch: async (_url, init) => {
          headers = new Headers(init?.headers)
          return new Response(null, { status: 204 })
        },
      }),
    )
    expect(headers!.get(FREEBUFF_EVENT_ID_HEADER)).toBe('caller-minted-id')
    expect(headers!.has(FREEBUFF_RENDER_DELAY_HEADER)).toBe(false)
  })
})
