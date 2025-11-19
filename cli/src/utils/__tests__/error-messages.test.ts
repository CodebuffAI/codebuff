import { describe, test, expect } from 'bun:test'
import {
  formatErrorMessage,
  formatErrorForDisplay,
  formatRetryBannerMessage,
  shouldShowRetryInfo,
} from '../error-messages'
import { ErrorCodes } from '@codebuff/sdk'

describe('Error Message Formatting', () => {
  describe('formatErrorMessage', () => {
    test('should format AUTH_FAILED errors correctly', () => {
      const error = { code: ErrorCodes.AUTH_FAILED, message: 'Invalid API key' }
      const formatted = formatErrorMessage(error)

      expect(formatted.title).toBe('Authentication Failed')
      expect(formatted.message).toBe('Your credentials are invalid or have expired.')
      expect(formatted.retryable).toBe(false)
      expect(formatted.guidance).toContain('verify your API key')
    })

    test('should format NETWORK_ERROR errors correctly', () => {
      const error = { code: ErrorCodes.NETWORK_ERROR, message: 'Connection refused' }
      const formatted = formatErrorMessage(error)

      expect(formatted.title).toBe('Network Error')
      expect(formatted.message).toBe('Connection refused')
      expect(formatted.retryable).toBe(true)
      expect(formatted.guidance).toContain('Check your internet connection')
    })

    test('should format TIMEOUT errors correctly', () => {
      const error = { code: ErrorCodes.TIMEOUT, message: 'Request timed out' }
      const formatted = formatErrorMessage(error)

      expect(formatted.title).toBe('Request Timeout')
      expect(formatted.retryable).toBe(true)
    })

    test('should format CONNECTION_LOST errors correctly', () => {
      const error = { code: ErrorCodes.CONNECTION_LOST, message: 'Connection lost' }
      const formatted = formatErrorMessage(error)

      expect(formatted.title).toBe('Connection Lost')
      expect(formatted.retryable).toBe(true)
      expect(formatted.guidance).toContain('retried when the connection is restored')
    })

    test('should handle unknown error codes', () => {
      const error = { code: 'UNKNOWN_CODE', message: 'Something went wrong' }
      const formatted = formatErrorMessage(error)

      expect(formatted.title).toBe('Error')
      expect(formatted.message).toBe('Something went wrong')
      expect(formatted.retryable).toBe(false)
    })

    test('should handle errors without codes', () => {
      const error = new Error('Generic error')
      const formatted = formatErrorMessage(error, 'Custom Context')

      expect(formatted.title).toBe('Error: Custom Context')
      expect(formatted.message).toBe('Generic error')
      expect(formatted.retryable).toBe(false)
    })

    test('should handle string errors', () => {
      const formatted = formatErrorMessage('Simple error string')

      expect(formatted.message).toBe('Simple error string')
      expect(formatted.retryable).toBe(false)
    })
  })

  describe('formatErrorForDisplay', () => {
    test('should format error with title and message', () => {
      const error = { code: ErrorCodes.AUTH_FAILED, message: 'Invalid token' }
      const display = formatErrorForDisplay(error)

      expect(display).toContain('**Authentication Failed:**')
      expect(display).toContain('Your credentials are invalid')
    })

    test('should include guidance when available', () => {
      const error = { code: ErrorCodes.NETWORK_ERROR, message: 'Connection failed' }
      const display = formatErrorForDisplay(error)

      expect(display).toContain('Check your internet connection')
      expect(display).toContain('*') // Guidance is italicized
    })

    test('should use custom context when provided', () => {
      const error = { message: 'Something broke' }
      const display = formatErrorForDisplay(error, 'Database Operation')

      expect(display).toContain('Error: Database Operation')
    })
  })

  describe('formatRetryBannerMessage', () => {
    test('should show retry count for retryable errors', () => {
      const error = { code: ErrorCodes.NETWORK_ERROR, message: 'Connection lost' }
      const banner = formatRetryBannerMessage(error, 3)

      expect(banner).toContain('⚠️')
      expect(banner).toContain('Network Error')
      expect(banner).toContain('3 messages will retry')
      expect(banner).toContain('Check your internet connection')
    })

    test('should use singular form for one message', () => {
      const error = { code: ErrorCodes.TIMEOUT, message: 'Timeout' }
      const banner = formatRetryBannerMessage(error, 1)

      expect(banner).toContain('1 message will retry')
      expect(banner).not.toContain('messages')
    })

    test('should not show retry count for non-retryable errors', () => {
      const error = { code: ErrorCodes.AUTH_FAILED, message: 'Auth failed' }
      const banner = formatRetryBannerMessage(error, 5)

      expect(banner).toContain('⚠️')
      expect(banner).toContain('Authentication Failed')
      expect(banner).not.toContain('will retry')
    })

    test('should not show retry count when count is zero', () => {
      const error = { code: ErrorCodes.NETWORK_ERROR, message: 'Network error' }
      const banner = formatRetryBannerMessage(error, 0)

      expect(banner).toContain('Network Error')
      expect(banner).not.toContain('will retry')
    })
  })

  describe('shouldShowRetryInfo', () => {
    test('should return true for retryable errors', () => {
      expect(shouldShowRetryInfo({ code: ErrorCodes.NETWORK_ERROR })).toBe(true)
      expect(shouldShowRetryInfo({ code: ErrorCodes.TIMEOUT })).toBe(true)
      expect(shouldShowRetryInfo({ code: ErrorCodes.CONNECTION_LOST })).toBe(true)
    })

    test('should return false for non-retryable errors', () => {
      expect(shouldShowRetryInfo({ code: ErrorCodes.AUTH_FAILED })).toBe(false)
      expect(shouldShowRetryInfo({ code: ErrorCodes.VALIDATION_ERROR })).toBe(false)
      expect(shouldShowRetryInfo({ code: ErrorCodes.INTERNAL_ERROR })).toBe(false)
    })

    test('should return false for unknown errors', () => {
      expect(shouldShowRetryInfo({ code: 'UNKNOWN' })).toBe(false)
      expect(shouldShowRetryInfo(new Error('Generic error'))).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    test('should handle null/undefined errors', () => {
      const formatted1 = formatErrorMessage(null)
      expect(formatted1.message).toBe('Unknown error')

      const formatted2 = formatErrorMessage(undefined)
      expect(formatted2.message).toBe('Unknown error')
    })

    test('should handle errors with missing message', () => {
      const error = { code: ErrorCodes.NETWORK_ERROR }
      const formatted = formatErrorMessage(error)

      expect(formatted.title).toBe('Network Error')
      expect(formatted.message).toBeTruthy()
    })

    test('should sanitize error messages in display format', () => {
      const error = {
        code: ErrorCodes.NETWORK_ERROR,
        message: 'Connection failed with error XYZ',
      }
      const display = formatErrorForDisplay(error)

      expect(display).toContain('Connection failed')
      expect(display).toContain('**Network Error:**')
    })
  })

  describe('Integration with ErrorCodes', () => {
    test('should handle all defined error codes', () => {
      const codes = Object.values(ErrorCodes)

      for (const code of codes) {
        const error = { code, message: `Test message for ${code}` }
        const formatted = formatErrorMessage(error)

        expect(formatted.title).toBeTruthy()
        expect(formatted.message).toBeTruthy()
        expect(typeof formatted.retryable).toBe('boolean')
      }
    })
  })
})
