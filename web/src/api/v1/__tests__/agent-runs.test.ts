import { TEST_USER_ID } from '@codebuff/common/old-constants'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { NextRequest } from 'next/server'

import { agentRunsPost } from '../agent-runs'

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

  let mockLogger: Logger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  }

  let mockDbInsert: any

  beforeEach(async () => {
    // Mock the db.insert chain
    mockDbInsert = {
      values: async () => {},
    }

    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    const dbModule = await import('@codebuff/common/db')
    spyOn(dbModule.default, 'insert').mockReturnValue(mockDbInsert)
  })

  afterEach(() => {
    mock.restore()
  })

  describe('Authentication', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })
      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Missing or invalid Authorization header' })
    })

    test('returns 401 when Authorization header is malformed', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'InvalidFormat' },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })
      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Missing or invalid Authorization header' })
    })

    test('extracts API key from x-codebuff-api-key header', async () => {
      const apiKey = 'test-api-key-123'
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { 'x-codebuff-api-key': apiKey },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')
    })

    test('extracts API key from Bearer token in Authorization header', async () => {
      const apiKey = 'test-api-key-123'
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')
    })

    test('returns 404 when API key is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-key' },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid API key or user not found' })
    })
  })

  describe('Request body validation', () => {
    test('returns 400 when body is not valid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: 'not json',
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid JSON in request body' })
    })

    test('returns 400 when action field is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })

    test('returns 400 when action is not START', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ action: 'STOP', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })

    test('returns 400 when agentId field is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ action: 'START' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })

    test('returns 400 when ancestorRunIds is not an array', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
          ancestorRunIds: 'not-an-array',
        }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })
  })

  describe('Successful responses', () => {
    test('creates agent run and returns runId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')
      expect(typeof body.runId).toBe('string')
      expect(body.runId.length).toBeGreaterThan(0)
    })

    test('creates agent run with ancestorRunIds', async () => {
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

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')
    })

    test('creates agent run with empty ancestorRunIds', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
          ancestorRunIds: [],
        }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('runId')
    })

    test('always generates new runId (never accepts from input)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          action: 'START',
          agentId: 'test-agent',
          runId: 'user-provided-run-id', // This should be ignored
        }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.runId).not.toBe('user-provided-run-id')
      expect(typeof body.runId).toBe('string')
    })

    test('returns test-run-id for TEST_USER_ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-test' },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.runId).toBe('test-run-id')
    })
  })

  describe('Error handling', () => {
    test('returns 500 when database insert fails', async () => {
      // Override the beforeEach mock to throw an error
      const errorMockDbInsert = {
        values: async () => {
          throw new Error('Database error')
        },
      }

      const dbModule = await import('@codebuff/common/db')
      spyOn(dbModule.default, 'insert').mockReturnValue(
        errorMockDbInsert as any
      )

      const req = new NextRequest('http://localhost:3000/api/v1/agent-runs', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ action: 'START', agentId: 'test-agent' }),
      })

      const response = await agentRunsPost({
        req,
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
        logger: mockLogger,
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Failed to create agent run' })
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
