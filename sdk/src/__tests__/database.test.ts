import { afterEach, describe, expect, mock, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

import { getUserInfoFromApiKey } from '../impl/database'

import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('getUserInfoFromApiKey', () => {
  const createLoggerMocks = (): Logger =>
    ({
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }) as unknown as Logger

  afterEach(() => {
    mock.restore()
  })

  test('requests only the requested fields (no implicit userColumns)', async () => {
    let fetchCalls = 0
    const fetchMock = async (input: RequestInfo | URL) => {
      fetchCalls += 1
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
    }
    const apiKey = `database-fields-test-key-${randomUUID()}`
    const result = await getUserInfoFromApiKey({
      apiKey,
      fields: ['id'],
      logger: createLoggerMocks(),
      fetch: fetchMock,
    })

    expect(fetchCalls).toBe(1)
    expect(result).toEqual({ id: 'user-123' })
  })

  test('merges cached fields and avoids refetching when present', async () => {
    let fetchCalls = 0
    const fetchMock = async (input: RequestInfo | URL) => {
      fetchCalls += 1
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
    }
    const logger = createLoggerMocks()

    const first = await getUserInfoFromApiKey({
      apiKey: 'cache-test-api-key',
      fields: ['id'],
      logger,
      fetch: fetchMock,
    })
    expect(first).toEqual({ id: 'user-123' })

    const second = await getUserInfoFromApiKey({
      apiKey: 'cache-test-api-key',
      fields: ['email'],
      logger,
      fetch: fetchMock,
    })
    expect(second).toEqual({ email: 'user@example.com' })

    const third = await getUserInfoFromApiKey({
      apiKey: 'cache-test-api-key',
      fields: ['id', 'email'],
      logger,
      fetch: fetchMock,
    })
    expect(third).toEqual({ id: 'user-123', email: 'user@example.com' })

    expect(fetchCalls).toBe(2)
  })
})
