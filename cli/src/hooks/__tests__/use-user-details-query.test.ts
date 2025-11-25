import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

import { createMockApiClient } from '../../__tests__/helpers/mock-api-client'
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
          fields: ['referral_link'] as const,
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
          fields: ['referral_link'] as const,
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
          fields: ['referral_link'] as const,
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
          fields: ['referral_link'] as const,
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
        referral_link: 'https://codebuff.com/r/abc123',
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
        fields: ['referral_link'] as const,
        logger: mockLogger,
        apiClient,
      })

      expect(result).toEqual(mockUserDetails)
    })

    test('returns null referral_link when not set', async () => {
      const mockUserDetails = {
        referral_link: null,
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
        fields: ['referral_link'] as const,
        logger: mockLogger,
        apiClient,
      })

      expect(result?.referral_link).toBe(null)
    })
  })

  describe('environment validation', () => {
    test('throws error when NEXT_PUBLIC_CODEBUFF_APP_URL is not set', async () => {
      delete process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

      // When no apiClient is provided and env is not set, createCodebuffApiClient
      // will throw due to missing baseUrl (or we test directly)
      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['referral_link'] as const,
          logger: mockLogger,
        }),
      ).rejects.toThrow()
    })
  })
})
