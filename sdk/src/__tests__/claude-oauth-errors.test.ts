import { describe, expect, it } from 'bun:test'

import {
  isClaudeOAuthRateLimitError,
  isClaudeOAuthAuthError,
} from '../impl/claude-oauth-errors'

/**
 * These tests focus on DOMAIN LOGIC - the specific status codes and string patterns
 * we use to detect Claude OAuth errors. Low-value tests that just verify JavaScript
 * built-in behavior (typeof, null checks) have been removed.
 */

describe('isClaudeOAuthRateLimitError', () => {
  describe('status code 429 detection', () => {
    it('should detect statusCode 429', () => {
      expect(isClaudeOAuthRateLimitError({ statusCode: 429 })).toBe(true)
    })

    it('should detect status 429 (AI SDK format)', () => {
      expect(isClaudeOAuthRateLimitError({ status: 429 })).toBe(true)
    })

    it('should NOT detect status 500 as rate limit', () => {
      expect(isClaudeOAuthRateLimitError({ statusCode: 500 })).toBe(false)
    })
  })

  describe('message pattern detection', () => {
    it('should detect "rate_limit" (underscore)', () => {
      expect(isClaudeOAuthRateLimitError({ message: 'rate_limit exceeded' })).toBe(true)
    })

    it('should detect "rate limit" (space)', () => {
      expect(isClaudeOAuthRateLimitError({ message: 'Rate limit exceeded' })).toBe(true)
    })

    it('should detect "overloaded"', () => {
      expect(isClaudeOAuthRateLimitError({ message: 'API is overloaded' })).toBe(true)
    })

    it('should be case-insensitive (calls toLowerCase)', () => {
      expect(isClaudeOAuthRateLimitError({ message: 'RATE_LIMIT' })).toBe(true)
      expect(isClaudeOAuthRateLimitError({ message: 'OVERLOADED' })).toBe(true)
    })
  })

  describe('responseBody pattern detection', () => {
    it('should detect rate_limit in responseBody', () => {
      expect(isClaudeOAuthRateLimitError({ responseBody: '{"error": "rate_limit"}' })).toBe(true)
    })

    it('should detect overloaded in responseBody', () => {
      expect(isClaudeOAuthRateLimitError({ responseBody: 'server is overloaded' })).toBe(true)
    })
  })

  it('should work with real Error objects', () => {
    const error = new Error('Rate limit exceeded')
    ;(error as any).statusCode = 429
    expect(isClaudeOAuthRateLimitError(error)).toBe(true)
  })
})

describe('isClaudeOAuthAuthError', () => {
  describe('status code 401/403 detection', () => {
    it('should detect statusCode 401', () => {
      expect(isClaudeOAuthAuthError({ statusCode: 401 })).toBe(true)
    })

    it('should detect statusCode 403', () => {
      expect(isClaudeOAuthAuthError({ statusCode: 403 })).toBe(true)
    })

    it('should NOT detect status 429 as auth error', () => {
      expect(isClaudeOAuthAuthError({ statusCode: 429 })).toBe(false)
    })
  })

  describe('message pattern detection', () => {
    it('should detect "unauthorized"', () => {
      expect(isClaudeOAuthAuthError({ message: 'Request unauthorized' })).toBe(true)
    })

    it('should detect "invalid_token"', () => {
      expect(isClaudeOAuthAuthError({ message: 'invalid_token: expired' })).toBe(true)
    })

    it('should detect "authentication"', () => {
      expect(isClaudeOAuthAuthError({ message: 'Authentication failed' })).toBe(true)
    })

    it('should detect "expired"', () => {
      expect(isClaudeOAuthAuthError({ message: 'Token expired' })).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(isClaudeOAuthAuthError({ message: 'UNAUTHORIZED' })).toBe(true)
    })
  })

  describe('responseBody pattern detection', () => {
    it('should detect auth patterns in responseBody', () => {
      expect(isClaudeOAuthAuthError({ responseBody: '{"error": "unauthorized"}' })).toBe(true)
      expect(isClaudeOAuthAuthError({ responseBody: 'invalid_token' })).toBe(true)
      expect(isClaudeOAuthAuthError({ responseBody: 'token has expired' })).toBe(true)
    })
  })
})

describe('error type mutual exclusivity', () => {
  it('rate limit errors should NOT be auth errors', () => {
    const rateLimitError = { statusCode: 429, message: 'rate_limit' }
    expect(isClaudeOAuthRateLimitError(rateLimitError)).toBe(true)
    expect(isClaudeOAuthAuthError(rateLimitError)).toBe(false)
  })

  it('auth errors should NOT be rate limit errors', () => {
    const authError = { statusCode: 401, message: 'unauthorized' }
    expect(isClaudeOAuthAuthError(authError)).toBe(true)
    expect(isClaudeOAuthRateLimitError(authError)).toBe(false)
  })

  it('server errors (500) should be neither', () => {
    const serverError = { statusCode: 500, message: 'internal server error' }
    expect(isClaudeOAuthRateLimitError(serverError)).toBe(false)
    expect(isClaudeOAuthAuthError(serverError)).toBe(false)
  })
})

/**
 * Mutation tests - verify our tests would catch real bugs.
 * These document the specific patterns our implementation relies on.
 */
describe('mutation detection (documents implementation requirements)', () => {
  it('REQUIRES status 429 for rate limit (not 428)', () => {
    // If implementation changed 429 to 428, this test would catch it
    expect(isClaudeOAuthRateLimitError({ statusCode: 428 })).toBe(false)
    expect(isClaudeOAuthRateLimitError({ statusCode: 429 })).toBe(true)
  })

  it('REQUIRES "overloaded" pattern for rate limit detection', () => {
    // If implementation removed "overloaded" check, this test would catch it
    expect(isClaudeOAuthRateLimitError({ message: 'overloaded' })).toBe(true)
  })

  it('REQUIRES both 401 AND 403 for auth errors', () => {
    // If implementation only checked 401, this test would catch it
    expect(isClaudeOAuthAuthError({ statusCode: 401 })).toBe(true)
    expect(isClaudeOAuthAuthError({ statusCode: 403 })).toBe(true)
  })

  it('REQUIRES "expired" pattern for auth error detection', () => {
    // If implementation removed "expired" check, this test would catch it
    expect(isClaudeOAuthAuthError({ message: 'expired' })).toBe(true)
  })
})
