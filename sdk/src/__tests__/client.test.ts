import { describe, expect, test, mock } from 'bun:test'
import { CodebuffClient } from '../client'

describe('CodebuffClient', () => {
  describe('checkConnection', () => {
    test('returns true when healthz responds with status ok', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('returns false when response is not ok', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ status: 'ok' }),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('returns false when status is not ok', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'error' }),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })

    test('returns false when response is not valid JSON', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })

    test('returns false when fetch throws an error', async () => {
      const mockFetch = mock(() => Promise.reject(new Error('Network error')))

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })

    test('returns false when response body is not an object', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve('not an object'),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })

    test('returns false when response body is null', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(null),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })

    test('returns false when response body has no status field', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'healthy' }),
        } as Response),
      )

      globalThis.fetch = mockFetch as typeof fetch

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })
  })
})
