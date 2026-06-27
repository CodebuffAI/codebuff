import {
  createAuthError,
  createForbiddenError,
  createHttpError,
  createNetworkError,
  createServerError,
} from '../../error-utils'
import {
  FAILOVER_ELIGIBLE_STATUS_CODES,
  isFailoverEligibleError,
  resolveModelsToTry,
} from '../failover'
import type { LoadedProviderConfig } from '../../provider-config'

import { describe, expect, it } from 'bun:test'

/**
 * Minimal LoadedProviderConfig fixture builder for failover tests. Only the
 * `config.failoverModels` field is read by the helpers, so the rest is filled
 * with the empty-config shape to satisfy the type.
 */
function makeLoadedConfig(
  failoverModels?: string[],
): LoadedProviderConfig | undefined {
  if (failoverModels === undefined) return undefined
  return {
    config: {
      providers: {},
      defaultModel: undefined,
      defaultReasoningEffort: undefined,
      modes: {},
      modeReasoningEfforts: {},
      agents: {},
      agentReasoningEfforts: {},
      indexing: {
        enabled: true,
        cacheDir: '.codebuff-index',
        exclude: [],
        semantic: { enabled: false, model: undefined },
      },
      fileChangeHooks: [],
      failoverModels,
    },
    sourceFilePaths: [],
  }
}

describe('resolveModelsToTry', () => {
  it('returns only the primary when no config is provided', () => {
    expect(resolveModelsToTry('openai/gpt-5.5', undefined)).toEqual([
      'openai/gpt-5.5',
    ])
  })

  it('returns only the primary when config has no failoverModels', () => {
    const config = makeLoadedConfig([])
    expect(resolveModelsToTry('openai/gpt-5.5', config)).toEqual([
      'openai/gpt-5.5',
    ])
  })

  it('prepends the primary and appends configured failover models in order', () => {
    const config = makeLoadedConfig([
      'anthropic/claude-sonnet-4-5',
      'openrouter/anthropic/claude-sonnet-4-5',
    ])
    expect(resolveModelsToTry('openai/gpt-5.5', config)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-sonnet-4-5',
      'openrouter/anthropic/claude-sonnet-4-5',
    ])
  })

  it('dedupes a failover model that repeats the primary', () => {
    const config = makeLoadedConfig([
      'openai/gpt-5.5',
      'anthropic/claude-sonnet-4-5',
    ])
    expect(resolveModelsToTry('openai/gpt-5.5', config)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-sonnet-4-5',
    ])
  })

  it('returns an empty array when the primary is undefined and no failovers are configured', () => {
    expect(resolveModelsToTry(undefined, undefined)).toEqual([])
  })

  it('returns only failover models when the primary is undefined', () => {
    const config = makeLoadedConfig(['anthropic/claude-sonnet-4-5'])
    expect(resolveModelsToTry(undefined, config)).toEqual([
      'anthropic/claude-sonnet-4-5',
    ])
  })

  it('preserves duplicates within the failover list (only dedupes against the primary)', () => {
    const config = makeLoadedConfig([
      'anthropic/claude-sonnet-4-5',
      'anthropic/claude-sonnet-4-5',
    ])
    expect(resolveModelsToTry('openai/gpt-5.5', config)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-sonnet-4-5',
      'anthropic/claude-sonnet-4-5',
    ])
  })
})

describe('FAILOVER_ELIGIBLE_STATUS_CODES', () => {
  it('contains auth codes 401 and 403', () => {
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(401)).toBe(true)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(403)).toBe(true)
  })

  it('contains 5xx server codes 500/502/503/504', () => {
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(500)).toBe(true)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(502)).toBe(true)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(503)).toBe(true)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(504)).toBe(true)
  })

  it('does NOT contain 408 (timeout) or 429 (rate limit) — retry-only', () => {
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(408)).toBe(false)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(429)).toBe(false)
  })

  it('does NOT contain 400/404/422 (client errors)', () => {
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(400)).toBe(false)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(404)).toBe(false)
    expect(FAILOVER_ELIGIBLE_STATUS_CODES.has(422)).toBe(false)
  })
})

describe('isFailoverEligibleError', () => {
  it('returns true for 401 auth errors', () => {
    expect(isFailoverEligibleError(createAuthError())).toBe(true)
  })

  it('returns true for 403 forbidden errors', () => {
    expect(isFailoverEligibleError(createForbiddenError())).toBe(true)
  })

  it('returns true for 500 server errors', () => {
    expect(isFailoverEligibleError(createServerError())).toBe(true)
  })

  it('returns true for 502 bad gateway', () => {
    expect(isFailoverEligibleError(createHttpError('bad gateway', 502))).toBe(
      true,
    )
  })

  it('returns true for 503 service unavailable (createNetworkError default)', () => {
    expect(isFailoverEligibleError(createNetworkError())).toBe(true)
  })

  it('returns true for 504 gateway timeout', () => {
    expect(isFailoverEligibleError(createHttpError('gateway timeout', 504))).toBe(
      true,
    )
  })

  it('returns false for 408 request timeout — retry-only, not failover-eligible', () => {
    expect(isFailoverEligibleError(createHttpError('timeout', 408))).toBe(false)
  })

  it('returns false for 429 rate limit — retry-only, not failover-eligible', () => {
    expect(isFailoverEligibleError(createHttpError('rate limited', 429))).toBe(
      false,
    )
  })

  it('returns false for 400 bad request', () => {
    expect(isFailoverEligibleError(createHttpError('bad request', 400))).toBe(
      false,
    )
  })

  it('returns false for 404 not found', () => {
    expect(isFailoverEligibleError(createHttpError('not found', 404))).toBe(
      false,
    )
  })

  it('returns false for 422 unprocessable entity', () => {
    expect(
      isFailoverEligibleError(createHttpError('unprocessable', 422)),
    ).toBe(false)
  })

  it('returns false for a plain Error with no status code', () => {
    expect(isFailoverEligibleError(new Error('network blip'))).toBe(false)
  })

  it('returns false for a non-Error value', () => {
    expect(isFailoverEligibleError('something went wrong')).toBe(false)
    expect(isFailoverEligibleError(undefined)).toBe(false)
    expect(isFailoverEligibleError(null)).toBe(false)
    expect(isFailoverEligibleError({})).toBe(false)
  })

  it('reads the AI SDK APICallError convention (`status` property)', () => {
    const apiCallError = new Error('provider 500') as Error & {
      status: number
    }
    ;(apiCallError as { status: number }).status = 500
    expect(isFailoverEligibleError(apiCallError)).toBe(true)
  })

  it('reads the `statusCode` property (our convention)', () => {
    const error = new Error('auth') as Error & { statusCode: number }
    ;(error as { statusCode: number }).statusCode = 401
    expect(isFailoverEligibleError(error)).toBe(true)
  })

  it('prefers `statusCode` over `status` when both are present (statusCode checked first)', () => {
    const error = new Error('mixed') as Error & {
      statusCode: number
      status: number
    }
    ;(error as { statusCode: number }).statusCode = 401
    ;(error as { status: number }).status = 200
    expect(isFailoverEligibleError(error)).toBe(true)
  })

  it('returns false when statusCode is a non-number string', () => {
    const error = new Error('bad') as Error & { statusCode: unknown }
    ;(error as { statusCode: unknown }).statusCode = '500'
    expect(isFailoverEligibleError(error)).toBe(false)
  })
})
