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
import type { postComposioTools as PostComposioTools } from '../tools/_post'

let postComposioExecute: typeof PostComposioExecute
let postComposioTools: typeof PostComposioTools

beforeAll(async () => {
  mock.module('server-only', () => ({}))
  ;({ postComposioExecute } = await import('../execute/_post'))
  ;({ postComposioTools } = await import('../tools/_post'))
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
      if (apiKey !== 'valid-key') return null
      return {
        id: 'user-123',
        email: 'user@example.com',
        discord_id: null,
      } as Awaited<ReturnType<GetUserInfoFromApiKeyFn>>
    })
  })

  afterEach(() => {
    mock.restore()
  })

  test('lists Composio tools for an authenticated user', async () => {
    const getToolsForUser = mock(async () => ({
      sessionId: 'session-123',
      tools: [
        {
          toolName: 'COMPOSIO_SEARCH_TOOLS',
          inputSchema: { type: 'object', properties: {} },
          description: 'Search Composio tools',
        },
      ],
    }))
    const checkRateLimit = mock(() => ({ limited: false as const }))
    const req = new NextRequest('http://localhost/api/v1/composio/tools', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
    })

    const response = await postComposioTools({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      getToolsForUser,
      checkRateLimit,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      sessionId: 'session-123',
      tools: [
        {
          toolName: 'COMPOSIO_SEARCH_TOOLS',
          inputSchema: { type: 'object', properties: {} },
          description: 'Search Composio tools',
        },
      ],
    })
    expect(getToolsForUser).toHaveBeenCalledTimes(1)
    expect(checkRateLimit).toHaveBeenCalledWith('user-123', 'tools')
  })

  test('rate limits Composio tool listing', async () => {
    const getToolsForUser = mock(async () => ({
      sessionId: 'session-123',
      tools: [],
    }))
    const checkRateLimit = mock(() => ({
      limited: true as const,
      retryAfterMs: 12_500,
      windowName: '1 minute',
    }))
    const req = new NextRequest('http://localhost/api/v1/composio/tools', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-key' },
    })

    const response = await postComposioTools({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      getToolsForUser,
      checkRateLimit,
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('13')
    expect(await response.json()).toEqual({
      error: 'Rate limited',
      retryAfterSeconds: 13,
    })
    expect(getToolsForUser).not.toHaveBeenCalled()
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
      sessionId: 'session-123',
      toolName: 'COMPOSIO_SEARCH_TOOLS',
      input: { query: 'gmail' },
    })
    expect(checkRateLimit).toHaveBeenCalledWith('user-123', 'execute')
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
    const req = new NextRequest('http://localhost/api/v1/composio/tools', {
      method: 'POST',
    })

    const response = await postComposioTools({
      req,
      getUserInfoFromApiKey,
      db: mockDb,
      logger,
      loggerWithContext,
      getToolsForUser: mock(async () => ({
        sessionId: 'session-123',
        tools: [],
      })),
      checkRateLimit: mock(() => ({ limited: false as const })),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Missing or invalid Authorization header',
    })
  })
})
