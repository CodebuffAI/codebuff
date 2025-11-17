import { describe, expect, test, mock, afterEach, spyOn } from 'bun:test'
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

  describe('error handling options', () => {
    test('uses default error handler when handleEvent not provided', () => {
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})

      const client = new CodebuffClient({ apiKey: 'test-key' })

      // Trigger the default error handler
      const defaultHandler = client.options.handleEvent
      if (defaultHandler) {
        defaultHandler({ type: 'error', message: 'Test error' })
      }

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2) // Error message + tip
      consoleErrorSpy.mockRestore()
    })

    test('does not add default error handler when disableConsoleErrors is true', () => {
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})

      const client = new CodebuffClient({
        apiKey: 'test-key',
        disableConsoleErrors: true,
      })

      // handleEvent should be undefined when disableConsoleErrors is true and no custom handler
      expect(client.options.handleEvent).toBeUndefined()

      consoleErrorSpy.mockRestore()
    })

    test('uses custom handleEvent when provided', () => {
      const customHandler = mock((event: any) => {
        if (event.type === 'error') {
          // Custom handling
        }
      })

      const client = new CodebuffClient({
        apiKey: 'test-key',
        handleEvent: customHandler,
      })

      expect(client.options.handleEvent).toBe(customHandler)
    })

    test('custom handleEvent works even with disableConsoleErrors', () => {
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})
      const customHandler = mock((event: any) => {})

      const client = new CodebuffClient({
        apiKey: 'test-key',
        handleEvent: customHandler,
        disableConsoleErrors: true,
      })

      // Should use custom handler, not default
      expect(client.options.handleEvent).toBe(customHandler)

      // Trigger the handler
      if (client.options.handleEvent) {
        client.options.handleEvent({ type: 'error', message: 'Test' })
      }

      // Custom handler should be called, not console.error
      expect(customHandler).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).not.toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    test('default handler logs error message and tip to console', () => {
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})

      const client = new CodebuffClient({ apiKey: 'test-key' })

      const defaultHandler = client.options.handleEvent
      if (defaultHandler) {
        defaultHandler({ type: 'error', message: 'Connection failed' })
      }

      const calls = consoleErrorSpy.mock.calls
      expect(calls[0][0]).toContain('Connection failed')
      expect(calls[1][0]).toContain('Tip:')

      consoleErrorSpy.mockRestore()
    })
  })
})
