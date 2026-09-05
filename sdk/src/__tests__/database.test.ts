import { afterEach, describe, expect, mock, test } from 'bun:test'

import { getUserInfoFromApiKey } from '../impl/database'

import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('getUserInfoFromApiKey', () => {
  const originalFetch = globalThis.fetch

  const createLoggerMocks = (): Logger =>
    ({
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }) as unknown as Logger

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  test('requests only the requested fields (no implicit userColumns)', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const urlString =
        input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input)
      const url = new URL(urlString)

      expect(url.pathname).toContain('/api/v1/me')
      expect(url.searchParams.get('fields')).toBe('id')

      return new Response(JSON.stringify({ id: 'user-123' }), { status: 200 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await getUserInfoFromApiKey({
      apiKey: 'test-api-key',
      fields: ['id'],
      logger: createLoggerMocks(),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: 'user-123' })
  })

  test('an abort ends the lookup and its retries instead of waiting out a silent socket', async () => {
    // a socket that never answers used to hold the run for the whole retry budget with nothing the
    // caller's abort could reach
    const fetchMock = mock(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')),
          )
        }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const controller = new AbortController()
    const started = Date.now()
    const lookup = getUserInfoFromApiKey({
      apiKey: 'aborted-api-key',
      fields: ['id'],
      logger: createLoggerMocks(),
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 20)

    await expect(lookup).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(1_000)
    // no retry after an abort: the one request, then out
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('never includes the API key in authentication failure logs', async () => {
    const apiKey = 'secret-api-key-that-must-not-be-logged'
    globalThis.fetch = mock(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch
    const logger = createLoggerMocks()

    await expect(
      getUserInfoFromApiKey({ apiKey, fields: ['id'], logger }),
    ).rejects.toThrow('Authentication failed')

    expect(
      JSON.stringify((logger.error as ReturnType<typeof mock>).mock.calls),
    ).not.toContain(apiKey)
  })

  test('merges cached fields and avoids refetching when present', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const urlString =
        input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input)
      const url = new URL(urlString)
      const fields = url.searchParams.get('fields')

      if (fields === 'id') {
        return new Response(JSON.stringify({ id: 'user-123' }), { status: 200 })
      }
      if (fields === 'email') {
        return new Response(JSON.stringify({ email: 'user@example.com' }), {
          status: 200,
        })
      }

      throw new Error(`Unexpected fields param: ${fields}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const logger = createLoggerMocks()

    const first = await getUserInfoFromApiKey({
      apiKey: 'cache-test-api-key',
      fields: ['id'],
      logger,
    })
    expect(first).toEqual({ id: 'user-123' })

    const second = await getUserInfoFromApiKey({
      apiKey: 'cache-test-api-key',
      fields: ['email'],
      logger,
    })
    expect(second).toEqual({ email: 'user@example.com' })

    const third = await getUserInfoFromApiKey({
      apiKey: 'cache-test-api-key',
      fields: ['id', 'email'],
      logger,
    })
    expect(third).toEqual({ id: 'user-123', email: 'user@example.com' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
