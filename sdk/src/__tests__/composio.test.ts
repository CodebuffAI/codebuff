import { afterEach, describe, expect, mock, test } from 'bun:test'

import { getComposioCustomToolDefinitions } from '../composio'

describe('getComposioCustomToolDefinitions', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('does not cache an empty tool list after discovery timeout', async () => {
    const apiKey = `timeout-key-${Date.now()}`
    const timeoutFetch = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal
        return new Promise<Response>((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error('aborted'))
            return
          }

          signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          )
        })
      },
    )
    globalThis.fetch = timeoutFetch as unknown as typeof fetch

    const timedOutTools = await getComposioCustomToolDefinitions({
      apiKey,
      logger: { warn: mock(() => {}) },
    })
    expect(timedOutTools).toEqual([])
    expect(timeoutFetch).toHaveBeenCalledTimes(1)

    const successFetch = mock(async () => {
      return new Response(
        JSON.stringify({
          sessionId: 'session-123',
          tools: [
            {
              toolName: 'COMPOSIO_SEARCH_TOOLS',
              inputSchema: { type: 'object', properties: {} },
              description: 'Search tools',
            },
          ],
        }),
        { status: 200 },
      )
    })
    globalThis.fetch = successFetch as unknown as typeof fetch

    const tools = await getComposioCustomToolDefinitions({
      apiKey,
      logger: { warn: mock(() => {}) },
    })

    expect(successFetch).toHaveBeenCalledTimes(1)
    expect(tools).toHaveLength(1)
    expect(tools[0]?.toolName).toBe('COMPOSIO_SEARCH_TOOLS')
  })
})
