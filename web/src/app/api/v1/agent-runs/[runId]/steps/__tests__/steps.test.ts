import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { beforeEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postAgentRunsSteps } from '../_post'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('agentRunsStepsPost', () => {
  let mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  let mockLogger: Logger
  let mockTrackEvent: TrackEventFn
  let mockDb: any

  beforeEach(() => {
    mockGetUserInfoFromApiKey = async ({ apiKey, fields }) => {
      if (apiKey === 'valid-key') {
        return Object.fromEntries(
          fields.map((field) => [
            field,
            field === 'id' ? 'user-123' : undefined,
          ]),
        ) as any
      }
      if (apiKey === 'test-key') {
        return Object.fromEntries(
          fields.map((field) => [
            field,
            field === 'id' ? TEST_USER_ID : undefined,
          ]),
        ) as any
      }
      return null
    }

    mockLogger = {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    }

    mockTrackEvent = () => {}

    // Default mock DB with successful operations
    mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ user_id: 'user-123' }],
          }),
        }),
      }),
      insert: () => ({
        values: async () => {},
      }),
    }
  })

  test('returns 401 when no API key provided', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        body: JSON.stringify({ stepNumber: 1 }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: mockDb,
    })

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.error).toBe('Missing or invalid Authorization header')
  })

  test('returns 404 when API key is invalid', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-key' },
        body: JSON.stringify({ stepNumber: 1 }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: mockDb,
    })

    expect(response.status).toBe(404)
    const json = await response.json()
    expect(json.error).toBe('Invalid API key or user not found')
  })

  test('returns 400 when request body is invalid JSON', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-key' },
        body: 'invalid json',
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: mockDb,
    })

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toBe('Invalid JSON in request body')
  })

  test('returns 400 when schema validation fails', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-key' },
        body: JSON.stringify({ stepNumber: -1 }), // Invalid: negative
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: mockDb,
    })

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toBe('Invalid request body')
  })

  test('returns 404 when agent run does not exist', async () => {
    const dbWithNoRun = {
      ...mockDb,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [], // Empty array = not found
          }),
        }),
      }),
    } as any

    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-key' },
        body: JSON.stringify({ stepNumber: 1 }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: dbWithNoRun,
    })

    expect(response.status).toBe(404)
    const json = await response.json()
    expect(json.error).toBe('Agent run not found')
  })

  test('returns 403 when run belongs to different user', async () => {
    const dbWithDifferentUser = {
      ...mockDb,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ user_id: 'other-user' }],
          }),
        }),
      }),
    } as any

    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-key' },
        body: JSON.stringify({ stepNumber: 1 }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: dbWithDifferentUser,
    })

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.error).toBe('Unauthorized to add steps to this run')
  })

  test('returns test step ID for test user', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-key' },
        body: JSON.stringify({ stepNumber: 1 }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: mockDb,
    })

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.stepId).toBe('test-step-id')
  })

  test('successfully adds agent step', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-key' },
        body: JSON.stringify({
          stepNumber: 1,
          credits: 100,
          childRunIds: ['child-1', 'child-2'],
          messageId: 'msg-123',
          status: 'completed',
        }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: mockDb,
    })

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.stepId).toBeTruthy()
    expect(typeof json.stepId).toBe('string')
  })

  test('handles database errors gracefully', async () => {
    const dbWithError = {
      ...mockDb,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ user_id: 'user-123' }],
          }),
        }),
      }),
      insert: () => ({
        values: async () => {
          throw new Error('DB error')
        },
      }),
    } as any

    const req = new NextRequest(
      'http://localhost/api/v1/agent-runs/run-123/steps',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-key' },
        body: JSON.stringify({ stepNumber: 1 }),
      },
    )

    const response = await postAgentRunsSteps({
      req,
      runId: 'run-123',
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      trackEvent: mockTrackEvent,
      db: dbWithError,
    })

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.error).toBe('Failed to add agent step')
  })
})
