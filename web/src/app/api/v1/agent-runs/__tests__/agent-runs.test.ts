import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postAgentRuns } from '../_post'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  GetUserInfoFromApiKeyFn,
  GetUserInfoFromApiKeyOutput,
} from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('/api/v1/agent-runs POST endpoint', () => {
  const mockUserData: Record<
    string,
    NonNullable<Awaited<GetUserInfoFromApiKeyOutput<'id'>>>
  > = {
    'test-api-key-123': {
      id: 'user-123',
    },
    'test-api-key-456': {
      id: 'user-456',
    },
    'test-api-key-test': {
      id: TEST_USER_ID,
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
  let mockDb: any

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    mockTrackEvent = mock(() => {})

    mockDb = {
      insert: mock(() => ({
        values: mock(async () => {}),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(async () => {}),
        })),
      })),
    }
  })

  afterEach(() => {
    mock.restore()
  })

  describe('Authentication', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Missing or invalid Authorization header' })
    })

    test('returns 401 when Authorization header is malformed', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'InvalidFormat' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Missing or invalid Authorization header' })
    })

    test('extracts API key from x-codebuff-api-key header', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { 'x-codebuff-api-key': 'test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      expect(mockDb.insert).toHaveBeenCalled()
    })

    test('extracts API key from Bearer token', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      expect(mockDb.insert).toHaveBeenCalled()
    })

    test('returns 404 when API key is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-key' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid API key or user not found' })
    })
  })

  describe('Request validation', () => {
    test('returns 400 when body is not valid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: 'not json',
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid JSON in request body' })
    })

    test('returns 400 when action is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })

    test('returns 400 when action is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'INVALID',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })
  })

  describe('START action', () => {
    test('returns 400 when agentId is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })

    test('successfully creates agent run without ancestor IDs', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')
      expect(typeof body.runId).toBe('string')
      expect(body.runId.length).toBeGreaterThan(0)

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_CREATED,
        userId: 'user-123',
        properties: {
          agentId: 'test-agent',
          ancestorRunIds: [],
        },
        logger: mockLogger,
      })
    })

    test('successfully creates agent run with ancestor IDs', async () => {
      const ancestorRunIds = ['run-1', 'run-2']
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
          ancestorRunIds,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')

      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_CREATED,
        userId: 'user-123',
        properties: {
          agentId: 'test-agent',
          ancestorRunIds,
        },
        logger: mockLogger,
      })
    })

    test('handles empty ancestor IDs array', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
          ancestorRunIds: [],
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_CREATED,
        userId: 'user-123',
        properties: {
          agentId: 'test-agent',
          ancestorRunIds: [],
        },
        logger: mockLogger,
      })
    })

    test('returns 500 when database insertion fails', async () => {
      mockDb.insert = mock(() => ({
        values: mock(async () => {
          throw new Error('Database error')
        }),
      }))

      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Failed to create agent run' })
      expect(mockLogger.error).toHaveBeenCalled()
      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_CREATION_ERROR,
        userId: 'user-123',
        properties: expect.objectContaining({
          agentId: 'test-agent',
        }),
        logger: mockLogger,
      })
    })
  })

  describe('FINISH action', () => {
    test('returns 400 when runId is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          status: 'completed',
          totalSteps: 5,
          directCredits: 100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })

    test('returns 400 when status is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-123',
          status: 'invalid-status',
          totalSteps: 5,
          directCredits: 100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })

    test('returns 400 when totalSteps is negative', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-123',
          status: 'completed',
          totalSteps: -5,
          directCredits: 100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })

    test('returns 400 when credits are negative', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-123',
          status: 'completed',
          totalSteps: 5,
          directCredits: -100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })

    test('successfully finishes agent run with completed status', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-123',
          status: 'completed',
          totalSteps: 5,
          directCredits: 100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_COMPLETED,
        userId: 'user-123',
        properties: {
          runId: 'run-123',
          status: 'completed',
          totalSteps: 5,
          directCredits: 100,
          totalCredits: 150,
          hasError: false,
        },
        logger: mockLogger,
      })
    })

    test('successfully finishes agent run with failed status and error message', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-456',
          status: 'failed',
          totalSteps: 3,
          directCredits: 50,
          totalCredits: 75,
          errorMessage: 'Agent crashed unexpectedly',
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })

      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_COMPLETED,
        userId: 'user-123',
        properties: {
          runId: 'run-456',
          status: 'failed',
          totalSteps: 3,
          directCredits: 50,
          totalCredits: 75,
          hasError: true,
        },
        logger: mockLogger,
      })
    })

    test('successfully finishes agent run with cancelled status', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-789',
          status: 'cancelled',
          totalSteps: 2,
          directCredits: 25,
          totalCredits: 40,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })

      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_COMPLETED,
        userId: 'user-123',
        properties: {
          runId: 'run-789',
          status: 'cancelled',
          totalSteps: 2,
          directCredits: 25,
          totalCredits: 40,
          hasError: false,
        },
        logger: mockLogger,
      })
    })

    test('handles zero credits', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-zero',
          status: 'completed',
          totalSteps: 0,
          directCredits: 0,
          totalCredits: 0,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      expect(mockDb.update).toHaveBeenCalled()
    })

    test('returns 500 when database update fails', async () => {
      mockDb.update = mock(() => ({
        set: mock(() => ({
          where: mock(async () => {
            throw new Error('Database update error')
          }),
        })),
      }))

      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-error',
          status: 'completed',
          totalSteps: 5,
          directCredits: 100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Failed to finish agent run' })
      expect(mockLogger.error).toHaveBeenCalled()
      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.AGENT_RUN_COMPLETION_ERROR,
        userId: 'user-123',
        properties: expect.objectContaining({
          runId: 'run-error',
        }),
        logger: mockLogger,
      })
    })
  })

  describe('Test user handling', () => {
    test('skips database update for test user on FINISH action', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-test' },
        body: JSON.stringify({
          action: 'FINISH',
          runId: 'run-test',
          status: 'completed',
          totalSteps: 5,
          directCredits: 100,
          totalCredits: 150,
        }),
      })

      const response = await postAgentRuns({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
        trackEvent: mockTrackEvent,
        db: mockDb,
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })
      expect(mockDb.update).not.toHaveBeenCalled()
    })
  })
})
