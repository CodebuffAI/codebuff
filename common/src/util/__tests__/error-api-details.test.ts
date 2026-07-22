import { describe, expect, it } from 'bun:test'

import { extractApiErrorDetails, getErrorObject } from '../error'

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
        'Another instance of openbuff has taken over this session. Only one instance per account is allowed.',
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
        'Another instance of openbuff has taken over this session. Only one instance per account is allowed.',
    })
  })

  it('extracts Google OpenAI-compatible error arrays', () => {
    const apiError = new Error('Bad Request') as Error & {
      statusCode: number
      responseBody: string
    }
    apiError.statusCode = 401
    apiError.responseBody = JSON.stringify([
      {
        error: {
          code: 401,
          message:
            'Request had invalid authentication credentials. Expected OAuth 2 access token.',
          status: 'UNAUTHENTICATED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED',
              metadata: {
                service: 'aiplatform.googleapis.com',
              },
            },
          ],
        },
      },
    ])

    expect(extractApiErrorDetails(apiError)).toEqual({
      statusCode: 401,
      errorCode: 'ACCESS_TOKEN_TYPE_UNSUPPORTED',
      message:
        'Request had invalid authentication credentials. Expected OAuth 2 access token. (ACCESS_TOKEN_TYPE_UNSUPPORTED)',
    })
  })
})

describe('getErrorObject non-Error serialization', () => {
  it('serializes a plain object throw into legible JSON instead of [object Object]', () => {
    const result = getErrorObject({
      errorMessage: 'Upstream service temporarily unavailable',
    })
    expect(result.name).toBe('Error')
    expect(result.message).not.toBe('[object Object]')
    expect(result.message).toContain('Upstream service temporarily unavailable')
  })

  it('preserves the Error branch message unchanged', () => {
    const result = getErrorObject(new Error('boom'))
    expect(result.name).toBe('Error')
    expect(result.message).toBe('boom')
  })

  it('renders primitive and null/undefined throws via string coercion', () => {
    expect(getErrorObject('plain string error').message).toBe(
      'plain string error',
    )
    expect(getErrorObject(null).message).toBe('null')
    expect(getErrorObject(undefined).message).toBe('undefined')
  })
})
