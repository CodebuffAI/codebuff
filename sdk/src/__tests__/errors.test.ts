import { describe, expect, test } from 'bun:test'
import { NetworkError, AuthenticationError, isNetworkError, isAuthenticationError } from '../errors'

describe('NetworkError', () => {
  test('removes unhelpful browser error messages', () => {
    const error = new NetworkError('Is the computer able to access the url?')
    expect(error.message).toBe('')
  })

  test('removes unhelpful text but preserves the rest', () => {
    const error = new NetworkError('Network error: Is the computer able to access the url?')
    expect(error.message).toBe('Network error:')
  })

  test('removes unhelpful text from middle of message', () => {
    const error = new NetworkError('Unable to connect. Is the computer able to access the url? Verify connection.')
    expect(error.message).toBe('Unable to connect. Verify connection.')
  })

  test('preserves helpful error messages', () => {
    const error = new NetworkError('Connection refused')
    expect(error.message).toBe('Connection refused')
  })

  test('includes error code', () => {
    const error = new NetworkError('Test error')
    expect(error.code).toBe('NETWORK_ERROR')
  })

  test('includes status when provided', () => {
    const error = new NetworkError('Server error', { status: 500 })
    expect(error.status).toBe(500)
  })

  test('includes originalError when provided', () => {
    const originalError = new Error('Original')
    const error = new NetworkError('Wrapped error', { originalError })
    expect(error.originalError).toBe(originalError)
  })

  test('includes streamTimedOut flag when provided', () => {
    const error = new NetworkError('Timeout', { streamTimedOut: true })
    expect(error.streamTimedOut).toBe(true)
  })
})

describe('AuthenticationError', () => {
  test('creates error with status', () => {
    const error = new AuthenticationError('Auth failed', 401)
    expect(error.message).toBe('Auth failed')
    expect(error.status).toBe(401)
    expect(error.code).toBe('AUTH_FAILED')
  })
})

describe('Type guards', () => {
  test('isNetworkError identifies NetworkError instances', () => {
    const error = new NetworkError('Test')
    expect(isNetworkError(error)).toBe(true)
    expect(isNetworkError(new Error('Test'))).toBe(false)
  })

  test('isAuthenticationError identifies AuthenticationError instances', () => {
    const error = new AuthenticationError('Test', 401)
    expect(isAuthenticationError(error)).toBe(true)
    expect(isAuthenticationError(new Error('Test'))).toBe(false)
  })
})
