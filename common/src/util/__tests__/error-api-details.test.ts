import { describe, expect, it } from 'bun:test'

import {
  extractApiErrorDetails,
  isFetchIdleTimeoutError,
  isTransientNetworkError,
} from '../error'

describe('extractApiErrorDetails', () => {
  it('extracts structured details from nested retry errors', () => {
    const apiError = new Error('Conflict') as Error & {
      statusCode: number
      responseBody: string
    }
    apiError.statusCode = 409
    apiError.responseBody = JSON.stringify({
      error: 'session_superseded',
      message:
        'Another instance of freebuff has taken over this session. Only one instance per account is allowed.',
    })

    const retryError = new Error(
      'Failed after 4 attempts. Last error: Conflict',
    ) as Error & {
      lastError: unknown
      errors: unknown[]
    }
    retryError.name = 'AI_RetryError'
    retryError.lastError = apiError
    retryError.errors = [apiError]

    expect(extractApiErrorDetails(retryError)).toEqual({
      statusCode: 409,
      errorCode: 'session_superseded',
      message:
        'Another instance of freebuff has taken over this session. Only one instance per account is allowed.',
    })
  })

  it('extracts details from OpenAI-style nested error objects', () => {
    const apiError = new Error('Too Many Requests') as Error & {
      statusCode: number
      responseBody: string
    }
    apiError.statusCode = 429
    apiError.responseBody = JSON.stringify({
      error: {
        message: 'Model is at capacity. Please try again later.',
        code: null,
        type: 'rate_limit_error',
      },
    })

    expect(extractApiErrorDetails(apiError)).toEqual({
      statusCode: 429,
      errorCode: 'rate_limit_error',
      message: 'Model is at capacity. Please try again later.',
    })
  })

  it('prefers nested error code over type when both are strings', () => {
    const apiError = new Error('Too Many Requests') as Error & {
      statusCode: number
      responseBody: string
    }
    apiError.statusCode = 429
    apiError.responseBody = JSON.stringify({
      error: {
        message: 'Slow down.',
        code: 'rate_limited',
        type: 'rate_limit_error',
      },
    })

    expect(extractApiErrorDetails(apiError)).toEqual({
      statusCode: 429,
      errorCode: 'rate_limited',
      message: 'Slow down.',
    })
  })

  it('keeps top-level string fields when both shapes are present', () => {
    const apiError = new Error('Too Many Requests') as Error & {
      statusCode: number
      responseBody: string
    }
    apiError.statusCode = 429
    apiError.responseBody = JSON.stringify({
      error: 'free_mode_rate_limited',
      message: 'Free mode rate limit exceeded (1 minute limit).',
    })

    expect(extractApiErrorDetails(apiError)).toEqual({
      statusCode: 429,
      errorCode: 'free_mode_rate_limited',
      message: 'Free mode rate limit exceeded (1 minute limit).',
    })
  })
})

describe('isFetchIdleTimeoutError', () => {
  it('detects a DOMException-style TimeoutError by name', () => {
    const error = new Error('The operation timed out.')
    error.name = 'TimeoutError'
    expect(isFetchIdleTimeoutError(error)).toBe(true)
  })

  it('detects the Bun timeout message without the TimeoutError name', () => {
    expect(isFetchIdleTimeoutError(new Error('The operation timed out.'))).toBe(
      true,
    )
  })

  it('detects a timeout nested inside an AI SDK RetryError wrapper', () => {
    const timeoutError = new Error('The operation timed out.')
    timeoutError.name = 'TimeoutError'
    const retryError = new Error(
      'Failed after 3 attempts.',
    ) as Error & { errors: unknown[] }
    retryError.errors = [timeoutError]
    expect(isFetchIdleTimeoutError(retryError)).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isFetchIdleTimeoutError(new Error('Internal Server Error'))).toBe(
      false,
    )
    expect(isFetchIdleTimeoutError(undefined)).toBe(false)
    expect(isFetchIdleTimeoutError('The operation timed out.')).toBe(false)
  })
})

describe('isTransientNetworkError', () => {
  it('detects the Bun socket-close message', () => {
    expect(
      isTransientNetworkError(
        new Error(
          'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
        ),
      ),
    ).toBe(true)
  })

  it('detects transient network error codes', () => {
    const error = new Error('request failed') as Error & { code: string }
    error.code = 'ECONNRESET'
    expect(isTransientNetworkError(error)).toBe(true)

    const bunError = new Error('request failed') as Error & { code: string }
    bunError.code = 'ConnectionClosed'
    expect(isTransientNetworkError(bunError)).toBe(true)
  })

  it('detects the undici "fetch failed" TypeError', () => {
    expect(isTransientNetworkError(new TypeError('fetch failed'))).toBe(true)
  })

  it('detects a socket error nested inside an AI SDK RetryError wrapper', () => {
    const socketError = new Error(
      'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
    ) as Error & { code: string }
    socketError.code = 'ECONNRESET'
    const retryError = new Error('Failed after 3 attempts.') as Error & {
      errors: unknown[]
    }
    retryError.errors = [socketError]
    expect(isTransientNetworkError(retryError)).toBe(true)
  })

  it('detects a socket error in a cause chain', () => {
    const inner = new Error('read ECONNRESET') as Error & { code: string }
    inner.code = 'ECONNRESET'
    const outer = new Error('Cannot connect to API')
    ;(outer as Error & { cause: unknown }).cause = inner
    expect(isTransientNetworkError(outer)).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isTransientNetworkError(new Error('Internal Server Error'))).toBe(
      false,
    )
    expect(isTransientNetworkError(undefined)).toBe(false)
    expect(isTransientNetworkError('fetch failed')).toBe(false)
    const serverError = new Error('Bad Request') as Error & {
      statusCode: number
    }
    serverError.statusCode = 400
    expect(isTransientNetworkError(serverError)).toBe(false)
  })
})
