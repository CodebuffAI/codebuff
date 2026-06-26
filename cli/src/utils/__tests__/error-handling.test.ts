import { describe, test, expect } from 'bun:test'

import { createErrorMessage } from '../error-handling'

describe('error-handling', () => {
  describe('createErrorMessage', () => {
    test('creates message from Error object', () => {
      const error = new Error('Something went wrong')
      const result = createErrorMessage(error, 'msg-123')

      expect(result.id).toBe('msg-123')
      expect(result.content).toContain('Something went wrong')
      expect(result.content).toContain('**Error:**')
      expect(result.isComplete).toBe(true)
      expect(result.blocks).toBeUndefined()
    })

    test('creates message from string error', () => {
      const result = createErrorMessage('String error', 'msg-456')

      expect(result.id).toBe('msg-456')
      expect(result.content).toContain('String error')
    })

    test('creates message from object with message property', () => {
      const error = { message: 'Object error message', code: 'ERR_001' }
      const result = createErrorMessage(error, 'msg-789')

      expect(result.content).toContain('Object error message')
    })

    test('uses fallback for unknown error types', () => {
      const result = createErrorMessage(null, 'msg-null')

      expect(result.content).toContain('Unknown error occurred')
    })

    test('does not leak stack trace to user-facing message (C1.7)', () => {
      const error = new Error('Error with stack')
      const result = createErrorMessage(error, 'msg-stack')

      expect(result.content).toContain('Error with stack')
      // Stack trace must NOT be included in the user-facing message — it is
      // logged internally only. Assert the message is exactly the sanitized form.
      expect(result.content).not.toContain('at ')
      expect(result.content).not.toContain(error.stack ?? 'STACK_SENTINEL')
      expect(result.content).toBe('**Error:** Error with stack')
    })

    test('handles error without message property', () => {
      const error = { code: 'ERR_UNKNOWN' }
      const result = createErrorMessage(error, 'msg-no-msg')

      expect(result.content).toContain('Unknown error occurred')
    })

    test('handles error with empty message', () => {
      const error = { message: '' }
      const result = createErrorMessage(error, 'msg-empty')

      expect(result.content).toContain('Unknown error occurred')
    })

    test('handles error with numeric message', () => {
      const error = { message: 123 }
      const result = createErrorMessage(error, 'msg-num')

      expect(result.content).toContain('Unknown error occurred')
    })

    test('handles payment required errors as normal errors', () => {
      const error = { statusCode: 402, message: 'Payment required' }
      const result = createErrorMessage(error, 'msg-402')

      expect(result.content).toContain('Payment required')
    })

    test('preserves message ID', () => {
      const error = new Error('Test')
      const result = createErrorMessage(error, 'unique-id-123')

      expect(result.id).toBe('unique-id-123')
    })

    test('marks message as complete', () => {
      const error = new Error('Test')
      const result = createErrorMessage(error, 'msg-complete')

      expect(result.isComplete).toBe(true)
    })

    test('clears blocks from error message', () => {
      const error = new Error('Test')
      const result = createErrorMessage(error, 'msg-blocks')

      expect(result.blocks).toBeUndefined()
    })

    test('handles deeply nested error objects', () => {
      const error = {
        message: 'Outer error',
        cause: {
          message: 'Inner error',
          cause: {
            message: 'Root cause',
          },
        },
      }
      const result = createErrorMessage(error, 'msg-nested')

      // Should only extract the top-level message
      expect(result.content).toContain('Outer error')
    })

    test('handles API error responses', () => {
      const apiError = {
        message: 'API request failed',
        statusCode: 500,
        response: { error: 'Internal server error' },
      }
      const result = createErrorMessage(apiError, 'msg-api')

      expect(result.content).toContain('API request failed')
    })

    test('handles network timeout errors', () => {
      const timeoutError = new Error('Request timeout')
      ;(timeoutError as any).code = 'ETIMEDOUT'
      const result = createErrorMessage(timeoutError, 'msg-timeout')

      expect(result.content).toContain('Request timeout')
    })

    test('handles auth errors', () => {
      const authError = {
        statusCode: 401,
        message: 'Invalid authentication token',
      }
      const result = createErrorMessage(authError, 'msg-auth')

      expect(result.content).toContain('Invalid authentication token')
    })
  })

  describe('error scenarios', () => {
    test('handles rate limit error (429)', () => {
      const rateLimitError = {
        statusCode: 429,
        message: 'Too many requests',
        retryAfter: 60,
      }

      const result = createErrorMessage(rateLimitError, 'msg-rate')
      expect(result.content).toContain('Too many requests')
    })

    test('handles server error (500)', () => {
      const serverError = {
        statusCode: 500,
        message: 'Internal server error',
      }

      const result = createErrorMessage(serverError, 'msg-500')
      expect(result.content).toContain('Internal server error')
    })

    test('handles validation error (400)', () => {
      const validationError = {
        statusCode: 400,
        message: 'Invalid request parameters',
        errors: [{ field: 'prompt', message: 'Required' }],
      }

      const result = createErrorMessage(validationError, 'msg-400')
      expect(result.content).toContain('Invalid request parameters')
    })

    test('handles forbidden error (403)', () => {
      const forbiddenError = {
        statusCode: 403,
        message: 'Access denied',
      }

      const result = createErrorMessage(forbiddenError, 'msg-403')
      expect(result.content).toContain('Access denied')
    })

    test('handles not found error (404)', () => {
      const notFoundError = {
        statusCode: 404,
        message: 'Resource not found',
      }

      const result = createErrorMessage(notFoundError, 'msg-404')
      expect(result.content).toContain('Resource not found')
    })

    test('handles conflict error (409)', () => {
      const conflictError = {
        statusCode: 409,
        message: 'Conflict detected',
      }

      const result = createErrorMessage(conflictError, 'msg-409')
      expect(result.content).toContain('Conflict detected')
    })
  })
})
