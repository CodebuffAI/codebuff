import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { MAX_RECENT_MESSAGES } from '@codebuff/common/constants/feedback'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { postFeedback } from '../_post'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'

describe('/api/v1/feedback POST endpoint', () => {
  const mockUserData: Record<string, { id: string; email: string; discord_id: string | null }> = {
    'test-api-key-123': {
      id: 'user-123',
      email: 'test@example.com',
      discord_id: 'discord-123',
    },
    'test-api-key-456': {
      id: 'user-456',
      email: 'test2@example.com',
      discord_id: null,
    },
  }

  const mockGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn = async ({
    apiKey,
  }) => {
    const userData = mockUserData[apiKey]
    if (!userData) {
      return null
    }
    return userData as Awaited<ReturnType<GetUserInfoFromApiKeyFn>>
  }

  let mockLogger: Logger
  let mockLoggerWithContext: LoggerWithContextFn
  let mockTrackEvent: TrackEventFn

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    mockLoggerWithContext = mock(() => mockLogger)
    mockTrackEvent = mock(() => {})
  })

  afterEach(() => {
    mock.restore()
  })

  const validFeedbackBody = {
    text: 'This is test feedback',
    category: 'good_result',
    type: 'general',
  }

  const callPostFeedback = (req: NextRequest) =>
    postFeedback({
      req,
      getUserInfoFromApiKey: mockGetUserInfoFromApiKey,
      logger: mockLogger,
      loggerWithContext: mockLoggerWithContext,
      trackEvent: mockTrackEvent,
    })

  describe('Authentication', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Unauthorized' })
    })

    test('returns 401 when Authorization header is malformed', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'InvalidFormat' },
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Unauthorized' })
    })

    test('returns 401 when API key is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-key' },
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ message: 'Invalid Codebuff API key' })
    })

    test('tracks auth error event when API key is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify(validFeedbackBody),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AnalyticsEvent.FEEDBACK_AUTH_ERROR,
        }),
      )
    })

    test('accepts Bearer token in Authorization header', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
    })

    test('accepts x-codebuff-api-key header', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { 'x-codebuff-api-key': 'test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
    })
  })

  describe('Request validation', () => {
    test('returns 400 when body is not valid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: 'not json',
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid JSON in request body' })
    })

    test('returns 400 when text is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ category: 'other', type: 'general' }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when category is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ text: 'feedback', type: 'general' }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when type is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ text: 'feedback', category: 'other' }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when category is not a valid enum value', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'feedback',
          category: 'invalid_category',
          type: 'general',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when type is not a valid enum value', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'feedback',
          category: 'other',
          type: 'invalid_type',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when type is message but messageId is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'feedback',
          category: 'other',
          type: 'message',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when type is message and messageId is empty', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'feedback',
          category: 'other',
          type: 'message',
          messageId: '',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('accepts very long text payloads', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'a'.repeat(20000),
          category: 'other',
          type: 'general',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
    })

    test('returns 400 when text is empty after trim', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: '',
          category: 'other',
          type: 'general',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when text is whitespace-only', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: '   \n\t  ',
          category: 'other',
          type: 'general',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when credits is negative', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          credits: -1,
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when sessionCreditsUsed is negative', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          sessionCreditsUsed: -5,
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when messageId exceeds max length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          messageId: 'a'.repeat(201),
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when recentMessages exceeds max array length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          recentMessages: Array.from({ length: MAX_RECENT_MESSAGES + 1 }, (_, i) => ({ type: 'user', id: `msg-${i}` })),
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when errors array exceeds max length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          errors: Array.from({ length: 51 }, (_, i) => ({ id: `err-${i}`, message: 'error' })),
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when error message exceeds max length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          errors: [{ id: 'err-1', message: 'a'.repeat(2001) }],
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when messageVariant is not a valid variant', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          messageVariant: 'variant-a',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when completionTime exceeds max length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          completionTime: 'a'.repeat(51),
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when agentMode exceeds max length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          agentMode: 'a'.repeat(101),
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when error id exceeds max length', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          errors: [{ id: 'a'.repeat(201), message: 'error' }],
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when clientFeedbackId is not a valid UUID', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          clientFeedbackId: 'not-a-uuid',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when source is not a valid enum value', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          source: 'invalid_source',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when recentMessages item type is not a valid variant', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          recentMessages: [{ type: 'invalid_variant', id: 'msg-1' }],
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when recentMessages item is missing required type field', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          recentMessages: [{ id: 'msg-1' }],
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('returns 400 when recentMessages item is missing required id field', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          recentMessages: [{ type: 'user' }],
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid request body')
    })

    test('accepts text with exactly 1 character after trim', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: '  x  ',
          category: 'other',
          type: 'general',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
    })

    test('tracks validation error event on invalid body', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({ text: '', category: 'bad', type: 'bad' }),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AnalyticsEvent.FEEDBACK_VALIDATION_ERROR,
          userId: 'user-123',
        }),
      )
    })
  })

  describe('Boundary values (exactly at limit)', () => {
    test('accepts constrained fields at their max limits', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'a'.repeat(5000),
          category: 'good_result',
          type: 'message',
          messageId: 'a'.repeat(200),
          messageVariant: 'ai',
          completionTime: 'a'.repeat(50),
          credits: 0,
          agentMode: 'a'.repeat(100),
          sessionCreditsUsed: 0,
          clientFeedbackId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          recentMessages: Array.from({ length: MAX_RECENT_MESSAGES }, (_, i) => ({ type: 'user', id: `msg-${i}` })),
          errors: Array.from({ length: 50 }, (_, i) => ({
            id: 'a'.repeat(200),
            message: 'a'.repeat(2000),
          })),
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })
    })
  })

  describe('Successful responses', () => {
    test('returns 200 with minimal valid feedback', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })
    })

    test('returns 200 with all optional fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'Detailed feedback',
          category: 'bad_result',
          type: 'message',
          messageId: 'msg-123',
          messageVariant: 'ai',
          completionTime: '3.5s',
          credits: 42,
          agentMode: 'MAX',
          sessionCreditsUsed: 100,
          source: 'cli',
          clientFeedbackId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          recentMessages: [{ type: 'user', id: 'msg-1' }],
          errors: [{ id: 'err-1', message: 'Something went wrong' }],
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })
    })

    test('accepts all valid category values', async () => {
      const categories = ['good_result', 'bad_result', 'app_bug', 'other'] as const
      for (const category of categories) {
        const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({ text: 'test', category, type: 'general' }),
        })

        const response = await callPostFeedback(req)
        expect(response.status).toBe(200)
      }
    })

    test('accepts both valid type values', async () => {
      const typesWithBody = [
        { type: 'general' },
        { type: 'message', messageId: 'msg-1' },
      ]
      for (const extra of typesWithBody) {
        const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key-123' },
          body: JSON.stringify({ text: 'test', category: 'other', ...extra }),
        })

        const response = await callPostFeedback(req)
        expect(response.status).toBe(200)
      }
    })

    test('accepts zero credits (nonnegative allows zero)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          credits: 0,
          sessionCreditsUsed: 0,
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ success: true })
    })

    test('trims whitespace from text before validation', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: '  actual feedback  ',
          category: 'other',
          type: 'general',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AnalyticsEvent.FEEDBACK_SUBMITTED,
          properties: expect.objectContaining({
            source: 'cli',
            feedback: expect.objectContaining({
              text: 'actual feedback',
            }),
          }),
        }),
      )
    })

    test('tracks FEEDBACK_SUBMITTED event with correct properties', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'Great feature',
          category: 'good_result',
          type: 'message',
          messageId: 'msg-456',
          messageVariant: 'user',
          completionTime: '2.1s',
          credits: 10,
          agentMode: 'DEFAULT',
          sessionCreditsUsed: 50,
        }),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.FEEDBACK_SUBMITTED,
        userId: 'user-123',
        properties: {
          clientFeedbackId: null,
          source: 'cli',
          messageId: 'msg-456',
          variant: 'user',
          completionTime: '2.1s',
          credits: 10,
          agentMode: 'DEFAULT',
          sessionCreditsUsed: 50,
          recentMessages: null,
          feedback: {
            text: 'Great feature',
            category: 'good_result',
            type: 'message',
            errors: null,
          },
        },
        logger: mockLogger,
      })
    })

    test('emits exactly one FEEDBACK_SUBMITTED event per successful submit', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AnalyticsEvent.FEEDBACK_SUBMITTED,
        }),
      )
    })

    test('tracks event with null for omitted optional fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith({
        event: AnalyticsEvent.FEEDBACK_SUBMITTED,
        userId: 'user-123',
        properties: {
          clientFeedbackId: null,
          source: 'cli',
          messageId: null,
          variant: null,
          completionTime: null,
          credits: null,
          agentMode: null,
          sessionCreditsUsed: null,
          recentMessages: null,
          feedback: {
            text: 'This is test feedback',
            category: 'good_result',
            type: 'general',
            errors: null,
          },
        },
        logger: mockLogger,
      })
    })

    test('strips unknown fields from request body', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          unknownField: 'should be stripped',
          anotherUnknown: 12345,
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
      const trackCall = (mockTrackEvent as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>
      const properties = trackCall.properties as Record<string, unknown>
      expect(properties).not.toHaveProperty('unknownField')
      expect(properties).not.toHaveProperty('anotherUnknown')
    })

    test('uses source from payload when provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          source: 'sdk',
        }),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            source: 'sdk',
          }),
        }),
      )
    })

    test('forwards clientFeedbackId to analytics when provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          ...validFeedbackBody,
          clientFeedbackId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        }),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            clientFeedbackId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          }),
        }),
      )
    })

    test('defaults source to cli when not provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      await callPostFeedback(req)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            source: 'cli',
          }),
        }),
      )
    })

    test('accepts type message with messageId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'feedback',
          category: 'other',
          type: 'message',
          messageId: 'msg-123',
        }),
      })

      const response = await callPostFeedback(req)

      expect(response.status).toBe(200)
    })

    test('returns 500 when an unexpected error occurs', async () => {
      const throwingGetUserInfo: typeof mockGetUserInfoFromApiKey = async () => {
        throw new Error('Database connection failed')
      }

      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify(validFeedbackBody),
      })

      const response = await postFeedback({
        req,
        getUserInfoFromApiKey: throwingGetUserInfo,
        logger: mockLogger,
        loggerWithContext: mockLoggerWithContext,
        trackEvent: mockTrackEvent,
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: 'Internal server error' })
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error handling /api/v1/feedback request',
      )
    })

    test('logs feedback submission metadata', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/feedback', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key-123' },
        body: JSON.stringify({
          text: 'Bug report',
          category: 'app_bug',
          type: 'message',
          messageId: 'msg-789',
        }),
      })

      await callPostFeedback(req)

      expect(mockLogger.info).toHaveBeenCalledWith(
        { userId: 'user-123', category: 'app_bug', type: 'message' },
        'Feedback submitted',
      )
    })
  })
})
