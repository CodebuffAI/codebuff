import { afterEach, beforeEach, describe, expect, mock, it } from 'bun:test'
import { NextRequest } from 'next/server'

import { formatQuotaResetCountdown, postChatCompletions } from '../_post'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { GetUserUsageDataFn } from '@codebuff/common/types/contracts/billing'
import type {
  GetAgentRunFromIdFn,
  GetUserInfoFromApiKeyFn,
} from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { BlockGrantResult } from '@codebuff/billing/subscription'
import type { GetUserPreferencesFn } from '../_post'

describe('/api/v1/chat/completions POST endpoint', () => {
  const mockUserData: Record<
    string,
    { id: string; banned: boolean }
  > = {
    'test-api-key-123': {
      id: 'user-123',
      banned: false,
    },
    'test-api-key-no-credits': {
      id: 'user-no-credits',
      banned: false,
    },
    'test-api-key-blocked': {
      id: 'banned-user-id',
      banned: true,
    },
  }

  const mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn = async ({
    apiKey,
  }) => {
    const userData = mockUserData[apiKey]
    if (!userData) {
      return null
    }
    return { id: userData.id, banned: userData.banned } as Awaited<ReturnType<GetUserInfoFromApiKeyFn>>
  }

  let mockLogger: Logger
  let mockLoggerWithContext: LoggerWithContextFn
  let mockTrackEvent: TrackEventFn
  let mockGetUserUsageData: GetUserUsageDataFn
  let mockGetAgentRunFromId: GetAgentRunFromIdFn
  let mockFetch: typeof globalThis.fetch
  let mockInsertMessageBigquery: InsertMessageBigqueryFn
  let nextQuotaReset: string

  beforeEach(() => {
    nextQuotaReset = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000,
    ).toISOString()

    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    mockLoggerWithContext = mock(() => mockLogger)

    mockTrackEvent = mock(() => {})

    mockGetUserUsageData = mock(async ({ userId }: { userId: string }) => {
      if (userId === 'user-no-credits') {
        return {
          usageThisCycle: 0,
          balance: {
            totalRemaining: 0,
            totalDebt: 0,
            netBalance: 0,
            breakdown: {},
          },
          nextQuotaReset,
        }
      }
      return {
        usageThisCycle: 0,
        balance: {
          totalRemaining: 100,
          totalDebt: 0,
          netBalance: 100,
          breakdown: {},
        },
        nextQuotaReset,
      }
    })

    mockGetAgentRunFromId = mock((async ({ runId }: any) => {
      if (runId === 'run-123') {
        return {
          agent_id: 'agent-123',
          status: 'running',
        }
      }
      if (runId === 'run-completed') {
        return {
          agent_id: 'agent-123',
          status: 'completed',
        }
      }
      return null
    }) satisfies GetAgentRunFromIdFn)

    // Mock global fetch to return OpenRouter-like responses
    mockFetch = (async (url: any, options: any) => {
      if (!options?.body) {
        throw new Error('Missing request body')
      }

      const body = JSON.parse(options.body)

      if (body.stream) {
        // Return streaming response
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            // Simulate OpenRouter SSE format
            controller.enqueue(
              encoder.encode(
                'data: {"id":"test-id","model":"test-model","choices":[{"delta":{"content":"test"}}]}\n\n',
              ),
            )
            controller.enqueue(
              encoder.encode(
                'data: {"id":"test-id","model":"test-model","choices":[{"delta":{"content":" stream"}}]}\n\n',
              ),
            )
            controller.enqueue(
              encoder.encode(
                'data: {"id":"test-id","model":"test-model","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30,"cost":0.001}}\n\n',
              ),
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          },
        })

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      } else {
        // Return non-streaming response
        return new Response(
          JSON.stringify({
            id: 'test-id',
            model: 'test-model',
            choices: [{ message: { content: 'test response' } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
              cost: 0.001,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }) as typeof globalThis.fetch

    mockInsertMessageBigquery = mock(async () => true)
  })

  afterEach(() => {
    mock.restore()
  })

  describe('Authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({ stream: true }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: globalThis.fetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Unauthorized' })
    })

    it('returns 401 when API key is invalid', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer invalid-key' },
          body: JSON.stringify({ stream: true }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Invalid Codebuff API key' })
    })
  })

  describe('Request body validation', () => {
    it('returns 400 when body is not valid JSON', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: 'not json',
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ message: 'Invalid JSON in request body' })
    })

    it('returns 400 when run_id is missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({ stream: true }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ message: 'No runId found in request body' })
    })

    it('returns 400 when agent run not found', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { run_id: 'run-nonexistent' },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        message: 'runId Not Found: run-nonexistent',
      })
    })

    it('returns 400 when agent run is not running', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { run_id: 'run-completed' },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        message: 'runId Not Running: run-completed',
      })
    })
  })

  describe('Banned users', () => {
    it('returns 403 with clear message for banned users', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-blocked' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { run_id: 'run-123' },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('account_suspended')
      expect(body.message).toContain('Your account has been suspended due to billing issues')
      expect(body.message).toContain('to resolve this')
    })
  })

  describe('Credit validation', () => {
    it('returns 402 when user has insufficient credits', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-no-credits' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { run_id: 'run-123' },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(402)
      const body = await response.json()
      const expectedResetCountdown = formatQuotaResetCountdown(nextQuotaReset)
      expect(body.message).toContain(expectedResetCountdown)
      expect(body.message).not.toContain(nextQuotaReset)
    })
  })

  describe('Successful responses', () => {
    it('returns stream with correct headers', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: {
              run_id: 'run-123',
              client_id: 'test-client-id-123',
              client_request_id: 'test-client-session-id-123',
            },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      if (response.status !== 200) {
        const errorBody = await response.json()
        console.log('Error response:', errorBody)
      }
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')
    })

    it('returns JSON response for non-streaming requests', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            model: 'test/test-model',
            stream: false,
            codebuff_metadata: {
              run_id: 'run-123',
              client_id: 'test-client-id-123',
              client_request_id: 'test-client-session-id-123',
            },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')
      const body = await response.json()
      expect(body.id).toBe('test-id')
      expect(body.choices[0].message.content).toBe('test response')
    })
  })

  describe('Subscription limit enforcement', () => {
    const createValidRequest = () =>
      new NextRequest('http://localhost:3000/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          model: 'test/test-model',
          stream: false,
          codebuff_metadata: {
            run_id: 'run-123',
            client_id: 'test-client-id-123',
            client_request_id: 'test-client-session-id-123',
          },
        }),
      })

    it('returns 429 when weekly limit reached and fallback disabled', async () => {
      const weeklyLimitError: BlockGrantResult = {
        error: 'weekly_limit_reached',
        used: 3500,
        limit: 3500,
        resetsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      }
      const mockEnsureSubscriberBlockGrant = mock(async () => weeklyLimitError)
      const mockGetUserPreferences: GetUserPreferencesFn = mock(async () => ({
        fallbackToALaCarte: false,
      }))

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        getUserPreferences: mockGetUserPreferences,
      })

      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error).toBe('rate_limit_exceeded')
      expect(body.message).toContain('weekly limit reached')
      expect(body.message).toContain('Enable "Continue with credits"')
    })

    it('returns 429 when block exhausted and fallback disabled', async () => {
      const blockExhaustedError: BlockGrantResult = {
        error: 'block_exhausted',
        blockUsed: 350,
        blockLimit: 350,
        resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      }
      const mockEnsureSubscriberBlockGrant = mock(async () => blockExhaustedError)
      const mockGetUserPreferences: GetUserPreferencesFn = mock(async () => ({
        fallbackToALaCarte: false,
      }))

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        getUserPreferences: mockGetUserPreferences,
      })

      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error).toBe('rate_limit_exceeded')
      expect(body.message).toContain('5-hour session limit reached')
      expect(body.message).toContain('Enable "Continue with credits"')
    })

    it('continues when weekly limit reached but fallback is enabled', async () => {
      const weeklyLimitError: BlockGrantResult = {
        error: 'weekly_limit_reached',
        used: 3500,
        limit: 3500,
        resetsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      }
      const mockEnsureSubscriberBlockGrant = mock(async () => weeklyLimitError)
      const mockGetUserPreferences: GetUserPreferencesFn = mock(async () => ({
        fallbackToALaCarte: true,
      }))

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        getUserPreferences: mockGetUserPreferences,
      })

      expect(response.status).toBe(200)
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('continues when block grant is created successfully', async () => {
      const blockGrant: BlockGrantResult = {
        grantId: 'block-123',
        credits: 350,
        expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
        isNew: true,
      }
      const mockEnsureSubscriberBlockGrant = mock(async () => blockGrant)
      const mockGetUserPreferences: GetUserPreferencesFn = mock(async () => ({
        fallbackToALaCarte: false,
      }))

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        getUserPreferences: mockGetUserPreferences,
      })

      expect(response.status).toBe(200)
      // getUserPreferences should not be called when block grant succeeds
      expect(mockGetUserPreferences).not.toHaveBeenCalled()
    })

    it('continues when ensureSubscriberBlockGrant throws an error (fail open)', async () => {
      const mockEnsureSubscriberBlockGrant = mock(async () => {
        throw new Error('Database connection failed')
      })
      const mockGetUserPreferences: GetUserPreferencesFn = mock(async () => ({
        fallbackToALaCarte: false,
      }))

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        getUserPreferences: mockGetUserPreferences,
      })

      // Should continue processing (fail open)
      expect(response.status).toBe(200)
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('continues when user is not a subscriber (null result)', async () => {
      const mockEnsureSubscriberBlockGrant = mock(async () => null)
      const mockGetUserPreferences: GetUserPreferencesFn = mock(async () => ({
        fallbackToALaCarte: false,
      }))

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        getUserPreferences: mockGetUserPreferences,
      })

      expect(response.status).toBe(200)
      // getUserPreferences should not be called for non-subscribers
      expect(mockGetUserPreferences).not.toHaveBeenCalled()
    })

    it('defaults to allowing fallback when getUserPreferences is not provided', async () => {
      const weeklyLimitError: BlockGrantResult = {
        error: 'weekly_limit_reached',
        used: 3500,
        limit: 3500,
        resetsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      }
      const mockEnsureSubscriberBlockGrant = mock(async () => weeklyLimitError)

      const response = await postChatCompletions({
        req: createValidRequest(),
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
        // Note: getUserPreferences is NOT provided
      })

      // Should continue processing (default to allowing a-la-carte)
      expect(response.status).toBe(200)
    })

    it('does not call ensureSubscriberBlockGrant before validation passes', async () => {
      const mockEnsureSubscriberBlockGrant = mock(async () => null)

      // Request with invalid run_id
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            model: 'test/test-model',
            stream: false,
            codebuff_metadata: {
              run_id: 'run-nonexistent',
            },
          }),
        },
      )

      const response = await postChatCompletions({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
        loggerWithContext: mockLoggerWithContext,
        ensureSubscriberBlockGrant: mockEnsureSubscriberBlockGrant,
      })

      // Should return 400 for invalid run_id
      expect(response.status).toBe(400)
      // ensureSubscriberBlockGrant should NOT have been called
      expect(mockEnsureSubscriberBlockGrant).not.toHaveBeenCalled()
    })
  })
})
