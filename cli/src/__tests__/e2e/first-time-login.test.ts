import { describe, test, expect, mock } from 'bun:test'

import {
  generateLoginUrl,
  pollLoginStatus,
  type LoginUrlResponse,
} from '../../login/login-flow'
import { createMockApiClient } from '../helpers/mock-api-client'

import type { ApiResponse } from '../../utils/codebuff-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type MockLogger = {
  [K in keyof Logger]: ReturnType<typeof mock> & Logger[K]
}

const createLogger = (): MockLogger => ({
  info: mock(() => {}) as ReturnType<typeof mock> & Logger['info'],
  error: mock(() => {}) as ReturnType<typeof mock> & Logger['error'],
  warn: mock(() => {}) as ReturnType<typeof mock> & Logger['warn'],
  debug: mock(() => {}) as ReturnType<typeof mock> & Logger['debug'],
})

describe('First-Time Login Flow (helpers)', () => {
  test('generateLoginUrl posts fingerprint id and returns payload', async () => {
    const logger = createLogger()
    const responsePayload: LoginUrlResponse = {
      loginUrl: 'https://cli.test/login?code=abc123',
      fingerprintHash: 'hash-123',
      expiresAt: '2025-12-31T23:59:59Z',
    }

    const loginCodeMock = mock(async (req: { fingerprintId: string }) => {
      expect(req.fingerprintId).toBe('finger-001')
      return {
        ok: true,
        status: 200,
        data: responsePayload,
      } as ApiResponse<LoginUrlResponse>
    })

    const apiClient = createMockApiClient({ loginCode: loginCodeMock })

    const result = await generateLoginUrl(
      { logger, apiClient },
      { baseUrl: 'https://cli.test', fingerprintId: 'finger-001' },
    )

    expect(result).toEqual(responsePayload)
    expect(loginCodeMock.mock.calls.length).toBe(1)
  })

  test('pollLoginStatus resolves with user after handling transient 401 responses', async () => {
    const logger = createLogger()
    const apiResponses: Array<ApiResponse<{ user?: unknown }>> = [
      { ok: false, status: 401 },
      { ok: false, status: 401 },
      {
        ok: true,
        status: 200,
        data: {
          user: {
            id: 'new-user-123',
            name: 'New User',
            email: 'new@codebuff.dev',
            authToken: 'token-123',
          },
        },
      },
    ]
    let callCount = 0

    const loginStatusMock = mock(
      async (req: {
        fingerprintId: string
        fingerprintHash: string
        expiresAt: string
      }) => {
        expect(req.fingerprintId).toBe('finger-abc')
        expect(req.fingerprintHash).toBe('hash-xyz')
        expect(req.expiresAt).toBe('2030-01-02T03:04:05Z')

        const response =
          apiResponses[callCount] ?? apiResponses[apiResponses.length - 1]
        callCount += 1
        return response
      },
    )

    const apiClient = createMockApiClient({ loginStatus: loginStatusMock })

    const result = await pollLoginStatus(
      {
        sleep: async () => {},
        logger,
        apiClient,
      },
      {
        baseUrl: 'https://cli.test',
        fingerprintId: 'finger-abc',
        fingerprintHash: 'hash-xyz',
        expiresAt: '2030-01-02T03:04:05Z',
      },
    )

    expect(result.status).toBe('success')
    if (result.status !== 'success') {
      throw new Error(`Expected polling success but received ${result.status}`)
    }
    expect(result.attempts).toBe(3)
    const user = result.user as { id?: unknown }
    expect(user?.id).toBe('new-user-123')
    expect(loginStatusMock.mock.calls.length).toBe(3)
  })

  test('pollLoginStatus times out when user never appears', async () => {
    const logger = createLogger()
    let nowTime = 0
    const intervalMs = 5000
    const timeoutMs = 20000

    const loginStatusMock = mock(async () => {
      return { ok: false, status: 401 } as ApiResponse<{ user?: unknown }>
    })

    const apiClient = createMockApiClient({ loginStatus: loginStatusMock })

    const sleep = async () => {
      nowTime += intervalMs
    }

    const result = await pollLoginStatus(
      {
        sleep,
        logger,
        now: () => nowTime,
        apiClient,
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
    expect(loginStatusMock.mock.calls.length).toBeGreaterThan(0)
  })

  test('pollLoginStatus stops when caller aborts', async () => {
    const logger = createLogger()
    const loginStatusMock = mock(async () => {
      return { ok: false, status: 401 } as ApiResponse<{ user?: unknown }>
    })

    const apiClient = createMockApiClient({ loginStatus: loginStatusMock })

    let shouldContinue = true

    const resultPromise = pollLoginStatus(
      {
        sleep: async () => {
          shouldContinue = false
        },
        logger,
        apiClient,
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
    expect(loginStatusMock.mock.calls.length).toBeGreaterThan(0)
  })
})
