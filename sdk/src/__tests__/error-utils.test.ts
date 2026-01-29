import { describe, expect, test } from 'bun:test'

import {
  createHttpError,
  createAuthError,
  createForbiddenError,
  createPaymentRequiredError,
  createServerError,
  createNetworkError,
  isRetryableStatusCode,
  getErrorStatusCode,
  sanitizeErrorMessage,
  RETRYABLE_STATUS_CODES,
  type HttpError,
} from '../error-utils'

describe('error-utils', () => {
  describe('createHttpError', () => {
    test('creates error with statusCode', () => {
      const error = createHttpError('Something went wrong', 500)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Something went wrong')
      expect(error.statusCode).toBe(500)
    })

    test('error can be thrown and caught', () => {
      const error = createHttpError('Test error', 400)

      expect(() => {
        throw error
      }).toThrow('Test error')
    })
  })

  describe('createAuthError', () => {
    test('creates 401 error with default message', () => {
      const error = createAuthError()

      expect(error.statusCode).toBe(401)
      expect(error.message).toBe('Authentication failed')
    })

    test('creates 401 error with custom message', () => {
      const error = createAuthError('Invalid API key')

      expect(error.statusCode).toBe(401)
      expect(error.message).toBe('Invalid API key')
    })
  })

  describe('createForbiddenError', () => {
    test('creates 403 error with default message', () => {
      const error = createForbiddenError()

      expect(error.statusCode).toBe(403)
      expect(error.message).toBe('Access forbidden')
    })

    test('creates 403 error with custom message', () => {
      const error = createForbiddenError('Insufficient permissions')

      expect(error.statusCode).toBe(403)
      expect(error.message).toBe('Insufficient permissions')
    })
  })

  describe('createPaymentRequiredError', () => {
    test('creates 402 error with default message', () => {
      const error = createPaymentRequiredError()

      expect(error.statusCode).toBe(402)
      expect(error.message).toBe('Payment required')
    })

    test('creates 402 error with custom message', () => {
      const error = createPaymentRequiredError('Credit limit exceeded')

      expect(error.statusCode).toBe(402)
      expect(error.message).toBe('Credit limit exceeded')
    })
  })

  describe('createServerError', () => {
    test('creates 500 error with default message', () => {
      const error = createServerError()

      expect(error.statusCode).toBe(500)
      expect(error.message).toBe('Server error')
    })

    test('creates custom 5xx error', () => {
      const error = createServerError('Service unavailable', 503)

      expect(error.statusCode).toBe(503)
      expect(error.message).toBe('Service unavailable')
    })

    test('creates 502 bad gateway error', () => {
      const error = createServerError('Bad gateway', 502)

      expect(error.statusCode).toBe(502)
      expect(error.message).toBe('Bad gateway')
    })
  })

  describe('createNetworkError', () => {
    test('creates 503 error with default message', () => {
      const error = createNetworkError()

      expect(error.statusCode).toBe(503)
      expect(error.message).toBe('Network error')
    })

    test('creates 503 error with custom message', () => {
      const error = createNetworkError('Connection timeout')

      expect(error.statusCode).toBe(503)
      expect(error.message).toBe('Connection timeout')
    })
  })

  describe('RETRYABLE_STATUS_CODES', () => {
    test('contains expected status codes', () => {
      expect(RETRYABLE_STATUS_CODES.has(408)).toBe(true) // Request Timeout
      expect(RETRYABLE_STATUS_CODES.has(429)).toBe(true) // Too Many Requests
      expect(RETRYABLE_STATUS_CODES.has(500)).toBe(true) // Internal Server Error
      expect(RETRYABLE_STATUS_CODES.has(502)).toBe(true) // Bad Gateway
      expect(RETRYABLE_STATUS_CODES.has(503)).toBe(true) // Service Unavailable
      expect(RETRYABLE_STATUS_CODES.has(504)).toBe(true) // Gateway Timeout
    })

    test('does not contain non-retryable status codes', () => {
      expect(RETRYABLE_STATUS_CODES.has(400)).toBe(false)
      expect(RETRYABLE_STATUS_CODES.has(401)).toBe(false)
      expect(RETRYABLE_STATUS_CODES.has(403)).toBe(false)
      expect(RETRYABLE_STATUS_CODES.has(404)).toBe(false)
    })
  })

  describe('isRetryableStatusCode', () => {
    test('returns true for retryable status codes', () => {
      expect(isRetryableStatusCode(408)).toBe(true)
      expect(isRetryableStatusCode(429)).toBe(true)
      expect(isRetryableStatusCode(500)).toBe(true)
      expect(isRetryableStatusCode(502)).toBe(true)
      expect(isRetryableStatusCode(503)).toBe(true)
      expect(isRetryableStatusCode(504)).toBe(true)
    })

    test('returns false for non-retryable status codes', () => {
      expect(isRetryableStatusCode(200)).toBe(false)
      expect(isRetryableStatusCode(400)).toBe(false)
      expect(isRetryableStatusCode(401)).toBe(false)
      expect(isRetryableStatusCode(404)).toBe(false)
    })

    test('returns false for undefined status code', () => {
      expect(isRetryableStatusCode(undefined)).toBe(false)
    })

    test('returns false for status code 0', () => {
      expect(isRetryableStatusCode(0)).toBe(false)
    })
  })

  describe('getErrorStatusCode', () => {
    test('extracts statusCode from error object', () => {
      const error = createHttpError('Test', 418)
      expect(getErrorStatusCode(error)).toBe(418)
    })

    test('extracts status from AI SDK error', () => {
      const error = { status: 429, message: 'Rate limited' }
      expect(getErrorStatusCode(error)).toBe(429)
    })

    test('prefers statusCode over status', () => {
      const error = { statusCode: 500, status: 400, message: 'Test' }
      expect(getErrorStatusCode(error)).toBe(500)
    })

    test('returns undefined for plain Error', () => {
      const error = new Error('Plain error')
      expect(getErrorStatusCode(error)).toBeUndefined()
    })

    test('returns undefined for string', () => {
      expect(getErrorStatusCode('error string')).toBeUndefined()
    })

    test('returns undefined for null', () => {
      expect(getErrorStatusCode(null)).toBeUndefined()
    })

    test('returns undefined for undefined', () => {
      expect(getErrorStatusCode(undefined)).toBeUndefined()
    })

    test('returns undefined for non-numeric statusCode', () => {
      const error = { statusCode: '500' }
      expect(getErrorStatusCode(error)).toBeUndefined()
    })

    test('handles objects with numeric status strings', () => {
      const error = { status: 503 }
      expect(getErrorStatusCode(error)).toBe(503)
    })
  })

  describe('sanitizeErrorMessage', () => {
    test('returns message from Error object', () => {
      const error = new Error('Something went wrong')
      expect(sanitizeErrorMessage(error)).toBe('Something went wrong')
    })

    test('returns string directly', () => {
      expect(sanitizeErrorMessage('Plain string error')).toBe('Plain string error')
    })

    test('extracts message from object with message property', () => {
      const error = { message: 'Object error message' }
      expect(sanitizeErrorMessage(error)).toBe('Object error message')
    })

    test('returns string representation for other types', () => {
      expect(sanitizeErrorMessage(123)).toBe('123')
      expect(sanitizeErrorMessage(null)).toBe('null')
      expect(sanitizeErrorMessage(undefined)).toBe('undefined')
      expect(sanitizeErrorMessage({})).toBe('[object Object]')
    })

    test('handles non-string message property', () => {
      const error = { message: 456 }
      expect(sanitizeErrorMessage(error)).toBe('[object Object]')
    })

    test('handles deeply nested error objects', () => {
      const error = {
        message: 'Nested error',
        cause: { message: 'Root cause' },
      }
      expect(sanitizeErrorMessage(error)).toBe('Nested error')
    })
  })
})
