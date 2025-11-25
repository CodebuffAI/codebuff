import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

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
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        } as Response),
      )

      await expect(
        fetchUserDetails({
          authToken: 'invalid-token',
          fields: ['referral_link'] as const,
          logger: mockLogger,
          fetch: mockFetch,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 401)')
    })

    test('throws error on 500 Internal Server Error response', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response),
      )

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['referral_link'] as const,
          logger: mockLogger,
          fetch: mockFetch,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 500)')
    })

    test('throws error on 403 Forbidden response', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 403,
        } as Response),
      )

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['referral_link'] as const,
          logger: mockLogger,
          fetch: mockFetch,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 403)')
    })

    test('throws error on 404 Not Found response', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response),
      )

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['id', 'email'] as const,
          logger: mockLogger,
          fetch: mockFetch,
        }),
      ).rejects.toThrow('Failed to fetch user details (HTTP 404)')
    })

    test('logs error before throwing on API failure', async () => {
      const errorSpy = mock(() => {})
      const testLogger: Logger = {
        ...mockLogger,
        error: errorSpy,
      }

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response),
      )

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['referral_link'] as const,
          logger: testLogger,
          fetch: mockFetch,
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

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockUserDetails),
        } as Response),
      )

      const result = await fetchUserDetails({
        authToken: 'valid-token',
        fields: ['referral_link'] as const,
        logger: mockLogger,
        fetch: mockFetch,
      })

      expect(result).toEqual(mockUserDetails)
    })

    test('returns null referral_link when not set', async () => {
      const mockUserDetails = {
        referral_link: null,
      }

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockUserDetails),
        } as Response),
      )

      const result = await fetchUserDetails({
        authToken: 'valid-token',
        fields: ['referral_link'] as const,
        logger: mockLogger,
        fetch: mockFetch,
      })

      expect(result?.referral_link).toBe(null)
    })
  })

  describe('environment validation', () => {
    test('throws error when NEXT_PUBLIC_CODEBUFF_APP_URL is not set', async () => {
      delete process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

      await expect(
        fetchUserDetails({
          authToken: 'valid-token',
          fields: ['referral_link'] as const,
          logger: mockLogger,
        }),
      ).rejects.toThrow('NEXT_PUBLIC_CODEBUFF_APP_URL is not set')
    })
  })
})
