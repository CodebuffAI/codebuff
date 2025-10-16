import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { NextRequest } from 'next/server'

import { chatCompletionsPost } from '../chat-completions'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
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
  let mockGetUserUsageData: any
  let mockGetAgentRunFromId: any
  let mockHandleOpenRouterStream: any

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

    mockGetAgentRunFromId = mock(async ({ agentRunId }: any) => {
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
    })

    mockHandleOpenRouterStream = mock(async () => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test stream'))
          controller.close()
        },
      })
    })
  })

  afterEach(() => {
    mock.restore()
  })

  describe('Authentication', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({ stream: true }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Unauthorized' })
    })

    test('returns 401 when API key is invalid', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer invalid-key' },
          body: JSON.stringify({ stream: true }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Invalid Codebuff API key' })
    })
  })

  describe('Request body validation', () => {
    test('returns 400 when body is not valid JSON', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: 'not json',
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ message: 'Invalid JSON in request body' })
    })

    test('returns 500 when stream is not true', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({ stream: false }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ message: 'Not implemented. Use stream=true.' })
    })

    test('returns 400 when agent_run_id is missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({ stream: true }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ message: 'No agentRunId found in request body' })
    })

    test('returns 400 when agent run not found', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { agent_run_id: 'run-nonexistent' },
          }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        message: 'agentRunId Not Found: run-nonexistent',
      })
    })

    test('returns 400 when agent run is not running', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { agent_run_id: 'run-completed' },
          }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({
        message: 'agentRunId Not Running: run-completed',
      })
    })
  })

  describe('Credit validation', () => {
    test('returns 402 when user has insufficient credits', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-no-credits' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { agent_run_id: 'run-123' },
          }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(402)
      const body = await response.json()
      expect(body.message).toContain('Insufficient credits')
      expect(body.message).toContain('http://localhost:3000/usage')
    })
  })

  describe('Successful responses', () => {
    test('returns stream with correct headers', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { agent_run_id: 'run-123' },
          }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')
      expect(mockHandleOpenRouterStream).toHaveBeenCalledWith({
        body: {
          stream: true,
          codebuff_metadata: { agent_run_id: 'run-123' },
        },
        userId: 'user-123',
        agentId: 'agent-123',
      })
    })
  })

  describe('Error handling', () => {
    test('returns 500 when stream initialization fails', async () => {
      mockHandleOpenRouterStream = mock(async () => {
        throw new Error('Stream error')
      })

      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({
            stream: true,
            codebuff_metadata: { agent_run_id: 'run-123' },
          }),
        }
      )

      const response = await chatCompletionsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        getUserUsageData: mockGetUserUsageData,
        getAgentRunFromId: mockGetAgentRunFromId,
        handleOpenRouterStream: mockHandleOpenRouterStream,
        appUrl: 'http://localhost:3000',
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Failed to initialize stream' })
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
