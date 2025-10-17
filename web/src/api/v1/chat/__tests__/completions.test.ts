import { afterEach, beforeEach, describe, expect, mock, it } from 'bun:test'
import { NextRequest } from 'next/server'

import { chatCompletionsPost } from '../completions'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { GetUserUsageDataFn } from '@codebuff/common/types/contracts/billing'
import type {
  GetAgentRunFromIdFn,
  GetUserInfoFromApiKeyFn,
  GetUserInfoFromApiKeyOutput,
} from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('/api/v1/chat/completions POST endpoint', () => {
  const mockUserData: Record<
    string,
    NonNullable<Awaited<GetUserInfoFromApiKeyOutput<'id'>>>
  > = {
    'test-api-key-123': {
      id: 'user-123',
    },
    'test-api-key-no-credits': {
      id: 'user-no-credits',
    },
  }

  const mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn = async ({
    apiKey,
  }) => {
    const userData = mockUserData[apiKey]
    if (!userData) {
      return null
    }
    return { id: userData.id } as any
  }

  let mockLogger: Logger
  let mockTrackEvent: TrackEventFn
  let mockGetUserUsageData: GetUserUsageDataFn
  let mockGetAgentRunFromId: GetAgentRunFromIdFn
  let mockFetch: typeof globalThis.fetch
  let mockInsertMessageBigquery: InsertMessageBigqueryFn

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    mockTrackEvent = mock(() => {})

    mockGetUserUsageData = mock(async ({ userId }: { userId: string }) => {
      if (userId === 'user-no-credits') {
        return {
          balance: { totalRemaining: 0 },
          nextQuotaReset: '2024-12-31',
        }
      }
      return {
        balance: { totalRemaining: 100 },
        nextQuotaReset: '2024-12-31',
      }
    })

    mockGetAgentRunFromId = mock((async ({ agentRunId }: any) => {
      if (agentRunId === 'run-123') {
        return {
          agent_id: 'agent-123',
          status: 'running',
        }
      }
      if (agentRunId === 'run-completed') {
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
    }) as any

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

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: globalThis.fetch,
        insertMessageBigquery: mockInsertMessageBigquery,
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

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
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

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ message: 'Invalid JSON in request body' })
    })

    it('returns 400 when agent_run_id is missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({ stream: true }),
        },
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ message: 'No agentRunId found in request body' })
    })

    it('returns 400 when agent run not found', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { agent_run_id: 'run-nonexistent' },
          }),
        },
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        message: 'agentRunId Not Found: run-nonexistent',
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
            codebuff_metadata: { agent_run_id: 'run-completed' },
          }),
        },
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        message: 'agentRunId Not Running: run-completed',
      })
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
            codebuff_metadata: { agent_run_id: 'run-123' },
          }),
        },
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
      })

      expect(response.status).toBe(402)
      const body = await response.json()
      expect(body.message).toContain('Insufficient credits')
      expect(body.message).toContain('http://localhost:3000/usage')
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
              agent_run_id: 'run-123',
              client_id: 'test-client-id-123',
              client_request_id: 'test-client-session-id-123',
            },
          }),
        },
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
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
            stream: false,
            codebuff_metadata: {
              agent_run_id: 'run-123',
              client_id: 'test-client-id-123',
              client_request_id: 'test-client-session-id-123',
            },
          }),
        },
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        fetch: mockFetch,
        insertMessageBigquery: mockInsertMessageBigquery,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')
      const body = await response.json()
      expect(body.id).toBe('test-id')
      expect(body.choices[0].message.content).toBe('test response')
    })
  })
})
