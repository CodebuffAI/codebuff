import { describe, expect, it } from 'bun:test'

import {
  createProviderContentPolicyError,
  getProviderContentPolicyFinishError,
  isProviderContentPolicyError,
  isProviderContentPolicyResponse,
  normalizeProviderContentPolicyError,
} from '../../error-utils'

describe('provider content-policy errors', () => {
  it('classifies explicit moderation wording in an HTTP error response', () => {
    const error = Object.assign(new Error('Bad Request'), {
      status: 400,
      responseBody: JSON.stringify({ error: 'content blocked by policy' }),
    })

    expect(isProviderContentPolicyResponse(error)).toBe(true)
    const normalized = normalizeProviderContentPolicyError(error)
    expect(normalized).toBeDefined()
    expect(isProviderContentPolicyError(normalized)).toBe(true)
    expect(normalized?.statusCode).toBe(400)
  })

  it('does not classify an unrelated client error', () => {
    const error = Object.assign(new Error('Invalid tool_choice'), {
      status: 400,
      responseBody: JSON.stringify({ error: 'invalid request' }),
    })

    expect(isProviderContentPolicyResponse(error)).toBe(false)
    expect(normalizeProviderContentPolicyError(error)).toBeUndefined()
  })

  it('preserves an already classified policy error', () => {
    const error = createProviderContentPolicyError({
      finishReason: 'content-filter',
    })

    expect(normalizeProviderContentPolicyError(error)).toBe(error)
  })

  it('classifies only the content-filter finish reason', () => {
    expect(
      getProviderContentPolicyFinishError({
        finishReason: 'content-filter',
        model: 'agentrouter/test-model',
      }),
    ).toMatchObject({
      name: 'ProviderContentPolicyError',
      code: 'provider_content_policy',
      finishReason: 'content-filter',
    })
    expect(
      getProviderContentPolicyFinishError({
        finishReason: 'stop',
        model: 'agentrouter/test-model',
      }),
    ).toBeUndefined()
  })
})
