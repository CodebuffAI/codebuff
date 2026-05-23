import { describe, expect, test, mock, afterEach } from 'bun:test'

import { CodebuffClient } from '../client'

describe('CodebuffClient', () => {
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

  test('defaults to Openbuff local mode without a Codebuff API key', async () => {
    delete process.env.CODEBUFF_API_KEY
    delete process.env.OPENBUFF_LOCAL_MODE
    delete process.env.CODEBUFF_LOCAL_MODE

    const mockFetch = mock(() => Promise.reject(new Error('should not fetch')))
    setFetchMock(mockFetch)

    const client = new CodebuffClient({})

    expect(client.options.apiKey).toBe('openbuff-local-mode')
    expect(client.options.localMode).toBe(true)
    expect(await client.checkConnection()).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('allows explicit local mode with no API key', async () => {
    delete process.env.CODEBUFF_API_KEY

    const mockFetch = mock(() => Promise.reject(new Error('should not fetch')))
    setFetchMock(mockFetch)

    const client = new CodebuffClient({ localMode: true })

    expect(client.options.apiKey).toBe('openbuff-local-mode')
    expect(client.options.localMode).toBe(true)
    expect(await client.checkConnection()).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
