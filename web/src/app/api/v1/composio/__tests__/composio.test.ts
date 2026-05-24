import {
  describe,
  expect,
  mock,
  test,
  beforeAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import { NextRequest } from 'next/server'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { postComposioExecute as PostComposioExecute } from '../execute/_post'

let postComposioExecute: typeof PostComposioExecute

beforeAll(async () => {
  mock.module('server-only', () => ({}))
  ;({ postComposioExecute } = await import('../execute/_post'))
})

describe('/api/v1/composio', () => {
  const mockDb = {} as any
  let logger: Logger
  let loggerWithContext: LoggerWithContextFn
  let getUserInfoFromApiKey: GetUserInfoFromApiKeyFn

  beforeEach(() => {
    logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    loggerWithContext = mock(() => logger)
    getUserInfoFromApiKey = mock(async ({ apiKey }) => {
      if (apiKey === 'banned-key') {
        return {
          id: 'banned-user',
          email: 'banned@example.com',
          discord_id: null,
          banned: true,
        } as Awaited<ReturnType<GetUserInfoFromApiKeyFn>>
      }
      if (apiKey !== 'valid-key') return null
      return {
        id: 'user-123',
        email: 'user@example.com',
        discord_id: null,
        banned: false,
      } as Awaited<ReturnType<GetUserInfoFromApiKeyFn>>
    })
  })

  afterEach(() => {
    mock.restore()
  })

  test('executes a Composio tool for an authenticated user', async () => {
    const executeTool = mock(async () => [
      { type: 'json' as const, value: { ok: true } },
    ])
    const checkRateLimit = mock(() => ({ limited: false as const }))
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
      body: JSON.stringify({
        sessionId: 'session-123',
        toolName: 'COMPOSIO_SEARCH_TOOLS',
        input: { query: 'gmail' },
      }),
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool,
      checkRateLimit,
      isConfigured: () => true,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      output: [{ type: 'json', value: { ok: true } }],
    })
    expect(executeTool).toHaveBeenCalledWith({
      db: mockDb,
      userId: 'user-123',
      logger,
      sessionId: 'session-123',
      toolName: 'COMPOSIO_SEARCH_TOOLS',
      input: { query: 'gmail' },
    })
    expect(checkRateLimit).toHaveBeenCalledWith('user-123', 'execute')
  })

  test('executes a Composio tool without a client-provided session ID', async () => {
    const executeTool = mock(async () => [
      { type: 'json' as const, value: { ok: true } },
    ])
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
      body: JSON.stringify({
        toolName: 'COMPOSIO_SEARCH_TOOLS',
        input: {
          queries: ['find gmail tools'],
          session: { generate_id: true },
        },
      }),
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool,
      checkRateLimit: mock(() => ({ limited: false as const })),
      isConfigured: () => true,
    })

    expect(response.status).toBe(200)
    expect(executeTool).toHaveBeenCalledWith({
      db: mockDb,
      userId: 'user-123',
      logger,
      toolName: 'COMPOSIO_SEARCH_TOOLS',
      input: {
        queries: ['find gmail tools'],
        session: { generate_id: true },
      },
    })
  })

  test('returns 404 when a Composio session cannot be found for execute', async () => {
    const executeTool = mock(async () => null)
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
      body: JSON.stringify({
        sessionId: 'unknown-session',
        toolName: 'COMPOSIO_SEARCH_TOOLS',
        input: {},
      }),
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool,
      checkRateLimit: mock(() => ({ limited: false as const })),
      isConfigured: () => true,
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Composio session not found',
    })
  })

  test('returns 503 when Composio execute is not configured', async () => {
    const executeTool = mock(async () => [
      { type: 'json' as const, value: { ok: true } },
    ])
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
      body: JSON.stringify({
        sessionId: 'session-123',
        toolName: 'COMPOSIO_SEARCH_TOOLS',
        input: {},
      }),
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool,
      checkRateLimit: mock(() => ({ limited: false as const })),
      isConfigured: () => false,
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Composio is not configured',
    })
    expect(executeTool).not.toHaveBeenCalled()
  })

  test('rate limits Composio execute requests', async () => {
    const executeTool = mock(async () => [
      { type: 'json' as const, value: { ok: true } },
    ])
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
      body: JSON.stringify({
        sessionId: 'session-123',
        toolName: 'COMPOSIO_SEARCH_TOOLS',
        input: {},
      }),
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool,
      checkRateLimit: mock(() => ({
        limited: true as const,
        retryAfterMs: 1_000,
        windowName: '1 minute',
      })),
      isConfigured: () => true,
    })

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: 'Rate limited',
      retryAfterSeconds: 1,
    })
    expect(executeTool).not.toHaveBeenCalled()
  })

  test('rejects unauthenticated Composio requests', async () => {
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool: mock(async () => [{ type: 'json' as const, value: {} }]),
      checkRateLimit: mock(() => ({ limited: false as const })),
      isConfigured: () => true,
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Missing or invalid Authorization header',
    })
  })

  test('rejects suspended users before rate limiting or tool execution', async () => {
    const executeTool = mock(async () => [{ type: 'json' as const, value: {} }])
    const checkRateLimit = mock(() => ({ limited: false as const }))
    const req = new NextRequest('http://localhost/api/v1/composio/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer banned-key' },
      body: JSON.stringify({
        toolName: 'COMPOSIO_SEARCH_TOOLS',
        input: {},
      }),
    })

    const response = await postComposioExecute({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      executeTool,
      checkRateLimit,
      isConfigured: () => true,
    })

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('account_suspended')
    expect(body.message).toContain('Your account has been suspended')
    expect(executeTool).not.toHaveBeenCalled()
    expect(checkRateLimit).not.toHaveBeenCalled()
  })
})
