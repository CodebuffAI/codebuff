import { describe, expect, test } from 'bun:test'

import { classifyChatGptOAuthStreamError } from '../llm'

describe('classifyChatGptOAuthStreamError', () => {
  test('returns ignore when ChatGPT OAuth is not active', () => {
    const result = classifyChatGptOAuthStreamError({
      isChatGptOAuth: false,
      hasYieldedContent: false,
      error: { statusCode: 429 },
    })
    expect(result).toBe('ignore')
  })

  test('returns fallback-rate-limit for 429 before content is yielded', () => {
    const result = classifyChatGptOAuthStreamError({
      isChatGptOAuth: true,
      hasYieldedContent: false,
      error: { statusCode: 429 },
    })
    expect(result).toBe('fallback-rate-limit')
  })

  test('returns fail-auth-reconnect for 401/403 before content is yielded', () => {
    const unauthorized = classifyChatGptOAuthStreamError({
      isChatGptOAuth: true,
      hasYieldedContent: false,
      error: { statusCode: 401 },
    })
    const forbidden = classifyChatGptOAuthStreamError({
      isChatGptOAuth: true,
      hasYieldedContent: false,
      error: { statusCode: 403 },
    })

    expect(unauthorized).toBe('fail-auth-reconnect')
    expect(forbidden).toBe('fail-auth-reconnect')
  })

  test('returns fail-fast for non-rate-limit non-auth errors', () => {
    const result = classifyChatGptOAuthStreamError({
      isChatGptOAuth: true,
      hasYieldedContent: false,
      error: { statusCode: 500 },
    })
    expect(result).toBe('fail-fast')
  })

  test('returns ignore after partial output has been yielded', () => {
    const result = classifyChatGptOAuthStreamError({
      isChatGptOAuth: true,
      hasYieldedContent: true,
      error: { statusCode: 429 },
    })
    expect(result).toBe('ignore')
  })

  test('returns ignore when skip flag is set', () => {
    const result = classifyChatGptOAuthStreamError({
      isChatGptOAuth: true,
      skipChatGptOAuth: true,
      hasYieldedContent: false,
      error: { statusCode: 429 },
    })
    expect(result).toBe('ignore')
  })
})
