import { describe, expect, test, mock, afterEach } from 'bun:test'

import { OpenbuffClient } from '../client'

describe('OpenbuffClient', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }

  const setFetchMock = (mockFetch: ReturnType<typeof mock>) => {
    globalThis.fetch = mockFetch as unknown as typeof fetch
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  test('defaults to Openbuff local mode without an Openbuff API key', async () => {
    delete process.env.OPENBUFF_API_KEY
    delete process.env.OPENBUFF_LOCAL_MODE

    const mockFetch = mock(() => Promise.reject(new Error('should not fetch')))
    setFetchMock(mockFetch)

    const client = new OpenbuffClient({})

    expect(client.options.apiKey).toBe('')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('allows explicit local mode with no API key', async () => {
    delete process.env.OPENBUFF_API_KEY

    const mockFetch = mock(() => Promise.reject(new Error('should not fetch')))
    setFetchMock(mockFetch)

    const client = new OpenbuffClient({})

    expect(client.options.apiKey).toBe('')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
