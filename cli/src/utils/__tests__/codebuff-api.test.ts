import { describe, test, expect, mock, beforeEach } from 'bun:test'

import { createCodebuffApiClient } from '../codebuff-api'

// Type for mocked fetch function
type MockFetch = (url: string, options?: RequestInit) => Promise<Response>

describe('createCodebuffApiClient', () => {
  let mockFetch: ReturnType<typeof mock<MockFetch>>

  beforeEach(() => {
    mockFetch = mock<MockFetch>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'test-id' }),
      } as Response),
    )
  })

  describe('client creation', () => {
    test('should create client with default base URL', () => {
      const client = createCodebuffApiClient()
      expect(client.baseUrl).toBeTruthy()
    })

    test('should create client with custom base URL', () => {
      const client = createCodebuffApiClient({ baseUrl: 'https://custom.api' })
      expect(client.baseUrl).toBe('https://custom.api')
    })

    test('should store auth token', () => {
      const client = createCodebuffApiClient({ authToken: 'test-token' })
      expect(client.authToken).toBe('test-token')
    })
  })

  describe('GET requests', () => {
    test('should make GET request with correct URL', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.get('/api/v1/test', { retry: false })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit | undefined]
      expect(url).toBe('https://test.api/api/v1/test')
    })

    test('should add query parameters', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.get('/api/v1/me', {
        query: { fields: 'id,email' },
        retry: false,
      })

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit | undefined]
      expect(url).toBe('https://test.api/api/v1/me?fields=id%2Cemail')
    })

    test('should include Authorization header when authToken provided', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        authToken: 'my-token',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.get('/api/v1/test', { retry: false })

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.headers).toEqual({
        Authorization: 'Bearer my-token',
      })
    })

    test('should not include Authorization header when includeAuth is false', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        authToken: 'my-token',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.get('/api/v1/test', { includeAuth: false, retry: false })

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.headers).toEqual({})
    })
  })

  describe('POST requests', () => {
    test('should make POST request with JSON body', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.post('/api/v1/test', { key: 'value' }, { retry: false })

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.method).toBe('POST')
      expect(options?.headers).toEqual({
        'Content-Type': 'application/json',
      })
      expect(options?.body).toBe('{"key":"value"}')
    })

    test('should include Cookie header when includeCookie is true', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        authToken: 'my-token',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.post(
        '/api/v1/test',
        { data: 'test' },
        { includeCookie: true, includeAuth: false, retry: false },
      )

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.headers).toEqual({
        'Content-Type': 'application/json',
        Cookie: 'next-auth.session-token=my-token;',
      })
    })
  })

  describe('PUT requests', () => {
    test('should make PUT request with JSON body', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.put('/api/v1/test', { key: 'value' }, { retry: false })

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.method).toBe('PUT')
      expect(options?.headers).toEqual({
        'Content-Type': 'application/json',
      })
    })
  })

  describe('PATCH requests', () => {
    test('should make PATCH request with JSON body', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.patch('/api/v1/test', { key: 'value' }, { retry: false })

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.method).toBe('PATCH')
    })
  })

  describe('DELETE requests', () => {
    test('should make DELETE request without body', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.delete('/api/v1/test/123', { retry: false })

      const [url, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(url).toBe('https://test.api/api/v1/test/123')
      expect(options?.method).toBe('DELETE')
      expect(options?.body).toBeUndefined()
    })
  })

  describe('response handling', () => {
    test('should return ok response with data', async () => {
      const responseData = { id: 'user-123', email: 'test@example.com' }
      const mockSuccessFetch = mock<MockFetch>(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(responseData),
        } as Response),
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockSuccessFetch as unknown as typeof fetch,
      })

      const result = await client.get('/api/v1/me', { retry: false })

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      if (result.ok) {
        expect(result.data).toEqual(responseData)
      }
    })

    test('should return error response with message', async () => {
      const mockErrorFetch = mock<MockFetch>(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'Invalid token' }),
        } as Response),
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockErrorFetch as unknown as typeof fetch,
      })

      const result = await client.get('/api/v1/me', { retry: false })

      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      if (!result.ok) {
        expect(result.error).toBe('Invalid token')
      }
    })

    test('should handle non-JSON error responses', async () => {
      const mockErrorFetch = mock<MockFetch>(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.reject(new Error('Not JSON')),
          text: () => Promise.resolve('Server error occurred'),
        } as unknown as Response),
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockErrorFetch as unknown as typeof fetch,
      })

      const result = await client.get('/api/v1/test', { retry: false })

      expect(result.ok).toBe(false)
      expect(result.status).toBe(500)
      if (!result.ok) {
        expect(result.error).toBe('Server error occurred')
      }
    })

    test('should handle 204 No Content responses', async () => {
      const mockNoContentFetch = mock<MockFetch>(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.reject(new Error('No content')),
        } as Response),
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockNoContentFetch as unknown as typeof fetch,
      })

      const result = await client.delete('/api/v1/test/123', { retry: false })

      expect(result.ok).toBe(true)
      expect(result.status).toBe(204)
    })
  })

  describe('retry logic', () => {
    test('should retry on 500 errors', async () => {
      let callCount = 0
      const mockRetryFetch = mock<MockFetch>(() => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: 'Server error' }),
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response)
      })

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockRetryFetch as unknown as typeof fetch,
        retry: {
          maxRetries: 3,
          initialDelayMs: 10, // Fast for testing
          maxDelayMs: 50,
        },
      })

      const result = await client.get('/api/v1/test')

      expect(result.ok).toBe(true)
      expect(mockRetryFetch).toHaveBeenCalledTimes(3)
    })

    test('should not retry on 400 errors', async () => {
      const mockBadRequestFetch = mock<MockFetch>(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: () => Promise.resolve({ error: 'Invalid input' }),
        } as Response),
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockBadRequestFetch as unknown as typeof fetch,
        retry: { maxRetries: 3, initialDelayMs: 10 },
      })

      const result = await client.get('/api/v1/test')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(400)
      expect(mockBadRequestFetch).toHaveBeenCalledTimes(1)
    })

    test('should respect retry: false option', async () => {
      const mockServerErrorFetch = mock<MockFetch>(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({ error: 'Server error' }),
        } as Response),
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockServerErrorFetch as unknown as typeof fetch,
        retry: { maxRetries: 3 },
      })

      const result = await client.get('/api/v1/test', { retry: false })

      expect(result.ok).toBe(false)
      expect(mockServerErrorFetch).toHaveBeenCalledTimes(1)
    })

    test('should retry on network errors', async () => {
      let callCount = 0
      const mockNetworkErrorFetch = mock<MockFetch>(() => {
        callCount++
        if (callCount < 2) {
          return Promise.reject(new Error('Network error: fetch failed'))
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response)
      })

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockNetworkErrorFetch as unknown as typeof fetch,
        retry: { maxRetries: 3, initialDelayMs: 10 },
      })

      const result = await client.get('/api/v1/test')

      expect(result.ok).toBe(true)
      expect(mockNetworkErrorFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('timeout', () => {
    test('should pass abort signal to fetch', async () => {
      let receivedSignal: AbortSignal | null | undefined

      const mockFetchWithSignal = mock<MockFetch>(
        async (_url: string, options?: RequestInit) => {
          receivedSignal = options?.signal
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
          } as Response
        },
      )

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockFetchWithSignal as unknown as typeof fetch,
        defaultTimeoutMs: 5000,
      })

      await client.get('/api/v1/test', { retry: false })

      expect(receivedSignal).toBeDefined()
      expect(receivedSignal instanceof AbortSignal).toBe(true)
    })

    test('should handle abort error from fetch', async () => {
      const mockAbortFetch = mock<MockFetch>(() => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        return Promise.reject(error)
      })

      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        fetch: mockAbortFetch as unknown as typeof fetch,
      })

      // Should retry on abort errors
      await expect(
        client.get('/api/v1/test', { retry: false }),
      ).rejects.toThrow('The operation was aborted')
    })
  })

  describe('custom headers', () => {
    test('should merge custom headers', async () => {
      const client = createCodebuffApiClient({
        baseUrl: 'https://test.api',
        authToken: 'my-token',
        fetch: mockFetch as unknown as typeof fetch,
      })

      await client.get('/api/v1/test', {
        headers: { 'X-Custom-Header': 'custom-value' },
        retry: false,
      })

      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit | undefined,
      ]
      expect(options?.headers).toEqual({
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer my-token',
      })
    })
  })
})
