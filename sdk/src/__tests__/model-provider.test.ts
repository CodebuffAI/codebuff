import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'

import {
  markClaudeOAuthRateLimited,
  isClaudeOAuthRateLimited,
  resetClaudeOAuthRateLimit,
  fetchClaudeOAuthResetTime,
} from '../impl/model-provider'

describe('model-provider', () => {
  describe('rate limiting', () => {
    beforeEach(() => {
      // Reset rate limit state before each test
      resetClaudeOAuthRateLimit()
    })

    test('isClaudeOAuthRateLimited returns false by default', () => {
      expect(isClaudeOAuthRateLimited()).toBe(false)
    })

    test('markClaudeOAuthRateLimited sets rate limit with default time', () => {
      markClaudeOAuthRateLimited()
      expect(isClaudeOAuthRateLimited()).toBe(true)
    })

    test('markClaudeOAuthRateLimited respects custom reset time', () => {
      const futureDate = new Date(Date.now() + 60000) // 1 minute from now
      markClaudeOAuthRateLimited(futureDate)
      expect(isClaudeOAuthRateLimited()).toBe(true)
    })

    test('isClaudeOAuthRateLimited returns false after reset time passes', () => {
      const pastDate = new Date(Date.now() - 1000) // 1 second ago
      markClaudeOAuthRateLimited(pastDate)
      expect(isClaudeOAuthRateLimited()).toBe(false)
    })

    test('resetClaudeOAuthRateLimit clears rate limit', () => {
      markClaudeOAuthRateLimited()
      expect(isClaudeOAuthRateLimited()).toBe(true)

      resetClaudeOAuthRateLimit()
      expect(isClaudeOAuthRateLimited()).toBe(false)
    })

    test('rate limit auto-expires after time passes', async () => {
      // Set rate limit for 10ms in the future
      const nearFuture = new Date(Date.now() + 10)
      markClaudeOAuthRateLimited(nearFuture)
      expect(isClaudeOAuthRateLimited()).toBe(true)

      // Wait for expiration
      await Bun.sleep(20)

      expect(isClaudeOAuthRateLimited()).toBe(false)
    })
  })

  describe('fetchClaudeOAuthResetTime', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('returns null when API call fails', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await fetchClaudeOAuthResetTime('test-token')
      expect(result).toBeNull()
    })

    test('returns five_hour reset time when more restrictive', async () => {
      const fiveHourReset = new Date(Date.now() + 3600000).toISOString() // 1 hour
      const sevenDayReset = new Date(Date.now() + 172800000).toISOString() // 2 days

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              five_hour: {
                utilization: 95, // 95% used, only 5% remaining
                resets_at: fiveHourReset,
              },
              seven_day: {
                utilization: 50, // 50% used, 50% remaining
                resets_at: sevenDayReset,
              },
            }),
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await fetchClaudeOAuthResetTime('test-token')

      expect(result).not.toBeNull()
      expect(result?.toISOString()).toBe(fiveHourReset)
    })

    test('returns seven_day reset time when more restrictive', async () => {
      const fiveHourReset = new Date(Date.now() + 3600000).toISOString()
      const sevenDayReset = new Date(Date.now() + 172800000).toISOString()

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              five_hour: {
                utilization: 10, // 90% remaining
                resets_at: fiveHourReset,
              },
              seven_day: {
                utilization: 95, // 5% remaining
                resets_at: sevenDayReset,
              },
            }),
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await fetchClaudeOAuthResetTime('test-token')

      expect(result).not.toBeNull()
      expect(result?.toISOString()).toBe(sevenDayReset)
    })

    test('returns null when no reset times available', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              five_hour: {
                utilization: 50,
                resets_at: null,
              },
              seven_day: {
                utilization: 50,
                resets_at: null,
              },
            }),
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await fetchClaudeOAuthResetTime('test-token')
      expect(result).toBeNull()
    })

    test('handles null window data', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              five_hour: null,
              seven_day: null,
            }),
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await fetchClaudeOAuthResetTime('test-token')
      expect(result).toBeNull()
    })

    test('handles network errors gracefully', async () => {
      const mockFetch = mock(() => Promise.reject(new Error('Network error')))
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const result = await fetchClaudeOAuthResetTime('test-token')
      expect(result).toBeNull()
    })

    test('includes correct headers in request', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      await fetchClaudeOAuthResetTime('my-test-token')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]

      expect(url).toBe('https://api.anthropic.com/api/oauth/usage')
      expect(options.method).toBe('GET')

      const headers = options.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-test-token')
      expect(headers['Accept']).toBe('application/json')
      expect(headers['anthropic-version']).toBe('2023-06-01')
      expect(headers['anthropic-beta']).toContain('oauth-2025-04-20')
      expect(headers['anthropic-beta']).toContain('claude-code-20250219')
    })
  })


})
