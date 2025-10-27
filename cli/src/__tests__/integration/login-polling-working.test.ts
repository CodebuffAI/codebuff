import { describe, test, expect, mock } from 'bun:test'

import { generateLoginUrl, pollLoginStatus } from '../../login/login-flow'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { LoginUrlResponse } from '../../login/login-flow'

const createLogger = (): Logger & Record<string, ReturnType<typeof mock>> => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
})

const createClock = () => {
  let current = 0
  return {
    sleep: async (ms: number) => {
      current += ms
    },
    now: () => current,
  }
}

describe('Login Polling (Working)', () => {
  test('P0: Polling Lifecycle - should stop polling and return user when login succeeds', async () => {
    const logger = createLogger()
    const responses = [
      new Response(null, { status: 401 }),
      new Response(
        JSON.stringify({
          user: { id: 'u1', name: 'Test User', email: 'user@test.dev' },
        }),
        { status: 200 },
      ),
    ]
    const fetchMock = mock(async (input: RequestInfo) => {
      const callIndex = fetchMock.mock.calls.length - 1
      const url = new URL(String(input))
      expect(url.searchParams.get('fingerprintId')).toBe('finger-1')
      expect(url.searchParams.get('fingerprintHash')).toBe('hash-1')
      expect(url.searchParams.get('expiresAt')).toBe('2030-01-01T00:00:00Z')
      return responses[Math.min(callIndex, responses.length - 1)]
    })

    const clock = createClock()

    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: clock.sleep,
        logger,
        now: clock.now,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-1',
        fingerprintHash: 'hash-1',
        expiresAt: '2030-01-01T00:00:00Z',
        intervalMs: 10,
        timeoutMs: 200,
      },
    )

    expect(result.status).toBe('success')
    expect(result.attempts).toBe(2)
    expect(fetchMock.mock.calls.length).toBe(2)
  })

  test('P0: Polling Lifecycle - should keep polling on 401 responses', async () => {
    const logger = createLogger()
    let attempt = 0
    const fetchMock = mock(async () => {
      attempt += 1
      return new Response(null, { status: 401 })
    })

    const clock = createClock()
    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: clock.sleep,
        logger,
        now: clock.now,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-2',
        fingerprintHash: 'hash-2',
        expiresAt: '2030-01-01T00:00:00Z',
        intervalMs: 10,
        timeoutMs: 50,
      },
    )

    expect(result.status).toBe('timeout')
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  test('P0: Polling Lifecycle - should call fetch with full query metadata', async () => {
    const logger = createLogger()
    const fetchMock = mock(async (input: RequestInfo) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('fingerprintId')).toBe('finger-meta')
      expect(url.searchParams.get('fingerprintHash')).toBe('hash-meta')
      expect(url.searchParams.get('expiresAt')).toBe('2030-01-01T00:00:00Z')
      return new Response(
        JSON.stringify({
          user: { id: 'u-meta', name: 'Meta User', email: 'meta@test.dev' },
        }),
        { status: 200 },
      )
    })

    const clock = createClock()
    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: clock.sleep,
        logger,
        now: clock.now,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-meta',
        fingerprintHash: 'hash-meta',
        expiresAt: '2030-01-01T00:00:00Z',
        intervalMs: 5,
        timeoutMs: 50,
      },
    )

    expect(result.status).toBe('success')
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  test('P1: Error Handling - should log warnings on non-401 responses but continue polling', async () => {
    const logger = createLogger()
    const fetchMock = mock(async (_input: RequestInfo) => {
      return new Response(null, { status: 500, statusText: 'Server Error' })
    })

    const clock = createClock()
    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: clock.sleep,
        logger,
        now: clock.now,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-error',
        fingerprintHash: 'hash-error',
        expiresAt: '2030-01-01T00:00:00Z',
        intervalMs: 5,
        timeoutMs: 25,
      },
    )

    expect(result.status).toBe('timeout')
    expect(logger.warn.mock.calls.length).toBeGreaterThan(0)
  })

  test('P1: Error Handling - should swallow network errors and keep polling', async () => {
    const logger = createLogger()
    let attempt = 0
    const fetchMock = mock(async () => {
      attempt += 1
      if (attempt === 1) {
        return new Response(null, { status: 401 })
      }
      if (attempt === 2) {
        throw new Error('network failed')
      }
      return new Response(
        JSON.stringify({
          user: { id: 'user', name: 'Network User', email: 'net@test.dev' },
        }),
        { status: 200 },
      )
    })

    const clock = createClock()
    const result = await pollLoginStatus(
      {
        fetch: fetchMock as any,
        sleep: clock.sleep,
        logger,
        now: clock.now,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-network',
        fingerprintHash: 'hash-network',
        expiresAt: '2030-01-01T00:00:00Z',
        intervalMs: 5,
        timeoutMs: 100,
      },
    )

    expect(result.status).toBe('success')
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(
      logger.error.mock.calls.some(([payload]) =>
        JSON.stringify(payload).includes('network failed'),
      ),
    ).toBe(true)
  })

  test('P0: fetchLoginUrl wrapper - should hit backend and return payload', async () => {
    const logger = createLogger()
    const payload: LoginUrlResponse = {
      loginUrl: 'https://cli.test/login?code=code-123',
      fingerprintHash: 'hash-123',
      expiresAt: '2025-12-31T23:59:59Z',
    }
    const fetchMock = mock(async (input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe('https://cli.test/api/auth/cli/code')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
      expect(init?.body).toBe(JSON.stringify({ fingerprintId: 'finger-login' }))
      return new Response(JSON.stringify(payload), { status: 200 })
    })

    const result = await generateLoginUrl(
      { fetch: fetchMock as any, logger },
      { baseUrl: 'https://cli.test', fingerprintId: 'finger-login' },
    )

    expect(result).toEqual(payload)
  })

  test('P0: fetchLoginUrl wrapper - should throw when backend returns error', async () => {
    const logger = createLogger()
    const fetchMock = mock(async () => new Response(null, { status: 500 }))

    await expect(
      generateLoginUrl(
        { fetch: fetchMock as any, logger },
        { baseUrl: 'https://cli.test', fingerprintId: 'finger-login' },
      ),
    ).rejects.toThrow('Failed to get login URL')
  })
})
