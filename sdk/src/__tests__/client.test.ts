import { describe, expect, test, mock, afterEach } from 'bun:test'

import { CodebuffClient } from '../client'

describe('CodebuffClient', () => {
  const originalFetch = globalThis.fetch

  const setFetchMock = (mockFetch: ReturnType<typeof mock>) => {
    globalThis.fetch = mockFetch as unknown as typeof fetch
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkConnection', () => {
    test('returns true when healthz responds with status ok', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        } as Response),
      )

      setFetchMock(mockFetch)

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('a BYOK Anthropic connection is probed at /models with the version header its native API requires', async () => {
      const seen: Array<{ url: string; version: string | null; auth: string | null }> = []
      const mockFetch = mock((input: URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        seen.push({ url: String(input), version: headers.get('anthropic-version'), auth: headers.get('authorization') })
        return Promise.resolve({ ok: true, body: null } as Response)
      })
      setFetchMock(mockFetch)
      const client = new CodebuffClient({
        byok: {
          id: 'c', revision: 1, name: 'Anthropic', provider: 'openai-compatible',
          baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5',
          credentialRef: 'env:ANTHROPIC_API_KEY', createdAt: '2026-10-12T00:00:00.000Z',
          updatedAt: '2026-10-12T00:00:00.000Z', apiKey: 'sk-ant-test',
        },
      })
      expect(await client.checkConnection()).toBe(true)
      expect(seen).toEqual([
        { url: 'https://api.anthropic.com/v1/models', version: '2023-06-01', auth: 'Bearer sk-ant-test' },
      ])
    })

    test('returns false when response is not ok', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ status: 'ok' }),
        } as Response),
      )

      setFetchMock(mockFetch)

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

      setFetchMock(mockFetch)

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

      setFetchMock(mockFetch)

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })

    test('returns false when fetch throws an error', async () => {
      const mockFetch = mock(() => Promise.reject(new Error('Network error')))

      setFetchMock(mockFetch)

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

      setFetchMock(mockFetch)

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

      setFetchMock(mockFetch)

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

      setFetchMock(mockFetch)

      const client = new CodebuffClient({ apiKey: 'test-key' })
      const result = await client.checkConnection()

      expect(result).toBe(false)
    })
  })
})
