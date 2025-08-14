import { describe, expect, it } from 'bun:test'

import { OpenRouterErrorResponseSchema } from './error-response'

describe('OpenRouterErrorResponseSchema', () => {
  it('should be valid without a type, code, and param', () => {
    const errorWithoutTypeCodeAndParam = {
      error: {
        message: 'Example error message',
        metadata: { provider_name: 'Morph' },
      },
      user_id: 'example_1',
    }

    const result = OpenRouterErrorResponseSchema.parse(
      errorWithoutTypeCodeAndParam,
    )

    expect(result).toEqual({
      error: {
        message: 'Example error message',
        code: null,
        type: null,
        param: null,
      },
    })
  })

  it('should be invalid with a type', () => {
    const errorWithType = {
      error: {
        message: 'Example error message with type',
        type: 'invalid_request_error',
        code: 400,
        param: 'canBeAnything',
        metadata: { provider_name: 'Morph' },
      },
    }

    const result = OpenRouterErrorResponseSchema.parse(errorWithType)

    expect(result).toEqual({
      error: {
        code: 400,
        message: 'Example error message with type',
        type: 'invalid_request_error',
        param: 'canBeAnything',
      },
    })
  })
})
