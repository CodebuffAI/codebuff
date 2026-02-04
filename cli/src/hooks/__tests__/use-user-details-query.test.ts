import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test'

import { createMockApiClient } from '../../__tests__/helpers/mock-api-client'
import * as CodebuffApiModule from '../../utils/codebuff-api'
import { fetchUserDetails } from '../use-user-details-query'

import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('fetchUserDetails', () => {
  const mockLogger: Logger = {
    error: mock(() => {}),
    warn: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  }

  const originalEnv = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://test.codebuff.com'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
  })

  describe('API failure handling', () => {
    test('throws error on 401 Unauthorized response', async () => {
      const meMock = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      await expect(
        fetchUserDetails({
          authToken: 'invalid-token',
          fields: ['email'] as const,
          logger: mockLogger,
          apiClient,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 401)')
    })

    test('throws error on 500 Internal Server Error response', async () => {
      const meMock = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['email'] as const,
          logger: mockLogger,
          apiClient,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 500)')
    })

    test('throws error on 403 Forbidden response', async () => {
      const meMock = mock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['email'] as const,
          logger: mockLogger,
          apiClient,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 403)')
    })

    test('throws error on 404 Not Found response', async () => {
      const meMock = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['id', 'email'] as const,
          logger: mockLogger,
          apiClient,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 404)')
    })

    test('logs error before throwing on API failure', async () => {
      const errorSpy = mock(() => {})
      const testLogger: Logger = {
        ...mockLogger,
        error: errorSpy,
      }

      const meMock = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['email'] as const,
          logger: testLogger,
          apiClient,
        }),
      ).rejects.toThrow()

      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('successful responses', () => {
    test('returns user details on successful response', async () => {
      const mockUserDetails = {
        email: 'test@example.com',
      }

      const meMock = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          data: mockUserDetails,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      const result = await fetchUserDetails({
        authToken: 'valid-token',
        fields: ['email'] as const,
        logger: mockLogger,
        apiClient,
      })

      expect(result).toEqual(mockUserDetails)
    })

    test('returns null referral_code when not set', async () => {
      const mockUserDetails = {
        referral_code: null,
      }

      const meMock = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          data: mockUserDetails,
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      const result = await fetchUserDetails({
        authToken: 'valid-token',
        fields: ['referral_code'] as const,
        logger: mockLogger,
        apiClient,
      })

      expect(result?.referral_code).toBe(null)
    })
  })

  describe('environment validation', () => {
    test('uses shared API client when apiClient is not provided', async () => {
      const meMock = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          data: { email: 'test@example.com' },
        }),
      )
      const apiClient = createMockApiClient({ me: meMock })

      const setTokenSpy = spyOn(
        CodebuffApiModule,
        'setApiClientAuthToken',
      )
      spyOn(CodebuffApiModule, 'getApiClient').mockReturnValue(apiClient as ReturnType<typeof CodebuffApiModule.getApiClient>)

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['email'] as const,
          logger: mockLogger,
        }),
      ).resolves.toEqual({ email: 'test@example.com' })

      expect(setTokenSpy).toHaveBeenCalledWith('valid-token')
    })
  })
})
