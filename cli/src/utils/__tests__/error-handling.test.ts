import { describe, test, expect } from 'bun:test'

import {
  isOutOfCreditsError,
  OUT_OF_CREDITS_MESSAGE,
  createErrorMessage,
} from '../error-handling'

describe('error-handling', () => {
  describe('isOutOfCreditsError', () => {
    test('returns true for error with statusCode 402', () => {
      const error = { statusCode: 402, message: 'Payment required' }
      expect(isOutOfCreditsError(error)).toBe(true)
    })

    test('returns false for error with statusCode 401', () => {
      const error = { statusCode: 401, message: 'Unauthorized' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with statusCode 403', () => {
      const error = { statusCode: 403, message: 'Forbidden' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with statusCode 500', () => {
      const error = { statusCode: 500, message: 'Server error' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for null error', () => {
      expect(isOutOfCreditsError(null)).toBe(false)
    })

    test('returns false for undefined error', () => {
      expect(isOutOfCreditsError(undefined)).toBe(false)
    })

    test('returns false for string error', () => {
      expect(isOutOfCreditsError('error string')).toBe(false)
    })

    test('returns false for Error object without statusCode', () => {
      const error = new Error('Plain error')
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with non-402 numeric statusCode', () => {
      const error = { statusCode: 400, message: 'Bad request' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with string statusCode', () => {
      const error = { statusCode: '402', message: 'Payment required' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns true for 402 errors with additional properties', () => {
      const error = {
        statusCode: 402,
        message: 'Payment required',
        details: { credits: 0 },
        timestamp: new Date().toISOString(),
      }
      expect(isOutOfCreditsError(error)).toBe(true)
    })
  })

  describe('OUT_OF_CREDITS_MESSAGE', () => {
    test('contains usage URL', () => {
      expect(OUT_OF_CREDITS_MESSAGE).toContain('/usage')
    })

    test('contains out of credits message', () => {
      expect(OUT_OF_CREDITS_MESSAGE.toLowerCase()).toContain('out of credits')
    })

    test('contains add credits instruction', () => {
      expect(OUT_OF_CREDITS_MESSAGE.toLowerCase()).toContain('add credits')
    })
  })

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

    test('includes stack trace when available', () => {
      const error = new Error('Error with stack')
      const result = createErrorMessage(error, 'msg-stack')

      expect(result.content).toContain('Error with stack')
      // Stack trace should be included
      expect(result.content).toContain('at')
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

    test('handles out of credits error', () => {
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

      expect(isOutOfCreditsError(rateLimitError)).toBe(false)

      const result = createErrorMessage(rateLimitError, 'msg-rate')
      expect(result.content).toContain('Too many requests')
    })

    test('handles server error (500)', () => {
      const serverError = {
        statusCode: 500,
        message: 'Internal server error',
      }

      expect(isOutOfCreditsError(serverError)).toBe(false)

      const result = createErrorMessage(serverError, 'msg-500')
      expect(result.content).toContain('Internal server error')
    })

    test('handles validation error (400)', () => {
      const validationError = {
        statusCode: 400,
        message: 'Invalid request parameters',
        errors: [{ field: 'prompt', message: 'Required' }],
      }

      expect(isOutOfCreditsError(validationError)).toBe(false)

      const result = createErrorMessage(validationError, 'msg-400')
      expect(result.content).toContain('Invalid request parameters')
    })

    test('handles forbidden error (403)', () => {
      const forbiddenError = {
        statusCode: 403,
        message: 'Access denied',
      }

      expect(isOutOfCreditsError(forbiddenError)).toBe(false)

      const result = createErrorMessage(forbiddenError, 'msg-403')
      expect(result.content).toContain('Access denied')
    })

    test('handles not found error (404)', () => {
      const notFoundError = {
        statusCode: 404,
        message: 'Resource not found',
      }

      expect(isOutOfCreditsError(notFoundError)).toBe(false)

      const result = createErrorMessage(notFoundError, 'msg-404')
      expect(result.content).toContain('Resource not found')
    })

    test('handles conflict error (409)', () => {
      const conflictError = {
        statusCode: 409,
        message: 'Conflict detected',
      }

      expect(isOutOfCreditsError(conflictError)).toBe(false)

      const result = createErrorMessage(conflictError, 'msg-409')
      expect(result.content).toContain('Conflict detected')
    })
  })
})
