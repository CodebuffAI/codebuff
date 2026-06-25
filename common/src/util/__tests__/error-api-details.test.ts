import { describe, expect, it } from 'bun:test'

import { extractApiErrorDetails } from '../error'

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
