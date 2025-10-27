import { describe, test, expect, mock } from 'bun:test'

import {
  generateLoginUrl,
  pollLoginStatus,
  type LoginUrlResponse,
} from '../../login/login-flow'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const createLogger = (): Logger & Record<string, ReturnType<typeof mock>> => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
})

describe('First-Time Login Flow (helpers)', () => {
  test('generateLoginUrl posts fingerprint id and returns payload', async () => {
    const logger = createLogger()
    const responsePayload: LoginUrlResponse = {
      loginUrl: 'https://cli.test/login?code=abc123',
      fingerprintHash: 'hash-123',
      expiresAt: '2025-12-31T23:59:59Z',
    }

    const fetchMock = mock(async (input: RequestInfo, init?: RequestInit) => {
      expect(typeof input).toBe('string')
      expect(String(input)).toBe('https://cli.test/api/auth/cli/code')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
      expect(init?.body).toBe(JSON.stringify({ fingerprintId: 'finger-001' }))
      return new Response(JSON.stringify(responsePayload), { status: 200 })
    })

    const result = await generateLoginUrl(
      { fetch: fetchMock as any, logger },
      { baseUrl: 'https://cli.test', fingerprintId: 'finger-001' },
    )

    expect(result).toEqual(responsePayload)
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  test('pollLoginStatus resolves with user after handling transient 401 responses', async () => {
    const logger = createLogger()
    const responses: Array<Response> = [
      new Response(null, { status: 401 }),
      new Response(null, { status: 401 }),
      new Response(
        JSON.stringify({
          user: {
            id: 'new-user-123',
            name: 'New User',
            email: 'new@codebuff.dev',
            authToken: 'token-123',
          },
        }),
        { status: 200 },
      ),
    ]
    let callCount = 0

    const fetchMock = mock(async (input: RequestInfo) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('fingerprintId')).toBe('finger-abc')
      expect(url.searchParams.get('fingerprintHash')).toBe('hash-xyz')
      expect(url.searchParams.get('expiresAt')).toBe('2030-01-02T03:04:05Z')

      const response = responses[callCount] ?? responses[responses.length - 1]
      callCount += 1
      return response
    })

    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: async () => {},
        logger,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-abc',
        fingerprintHash: 'hash-xyz',
        expiresAt: '2030-01-02T03:04:05Z',
      },
    )

    expect(result.status).toBe('success')
    expect(result.attempts).toBe(3)
    expect(result).toHaveProperty('user')
    expect(
      (result as { user: { id: string } }).user.id,
    ).toBe('new-user-123')
    expect(fetchMock.mock.calls.length).toBe(3)
  })

  test('pollLoginStatus times out when user never appears', async () => {
    const logger = createLogger()
    let nowTime = 0
    const intervalMs = 5000
    const timeoutMs = 20000

    const fetchMock = mock(async () => {
      return new Response(null, { status: 401 })
    })

    const sleep = async () => {
      nowTime += intervalMs
    }

    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep,
        logger,
        now: () => nowTime,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-timeout',
        fingerprintHash: 'hash-timeout',
        expiresAt: '2030-01-02T03:04:05Z',
        intervalMs,
        timeoutMs,
      },
    )

    expect(result.status).toBe('timeout')
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
  })

  test('pollLoginStatus stops when caller aborts', async () => {
    const logger = createLogger()
    let attempts = 0
    const fetchMock = mock(async () => {
      attempts += 1
      return new Response(null, { status: 401 })
    })

    let shouldContinue = true

    const resultPromise = pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: async () => {
          shouldContinue = false
        },
        logger,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-abort',
        fingerprintHash: 'hash-abort',
        expiresAt: '2030-01-02T03:04:05Z',
        shouldContinue: () => shouldContinue,
      },
    )

    const result = await resultPromise
    expect(result.status).toBe('aborted')
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
  })
})
