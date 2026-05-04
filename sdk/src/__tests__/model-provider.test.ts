import { describe, expect, test, beforeEach } from 'bun:test'

import {
  isChatGptOAuthRateLimited,
  markChatGptOAuthRateLimited,
  resetChatGptOAuthRateLimit,
} from '../impl/model-provider'

describe('model-provider', () => {
  describe('chatgpt oauth rate limiting', () => {
    beforeEach(() => {
      resetChatGptOAuthRateLimit()
    })

    test('isChatGptOAuthRateLimited returns false by default', () => {
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })

    test('markChatGptOAuthRateLimited sets rate limit with default time', () => {
      markChatGptOAuthRateLimited()
      expect(isChatGptOAuthRateLimited()).toBe(true)
    })

    test('markChatGptOAuthRateLimited respects custom reset time', () => {
      const futureDate = new Date(Date.now() + 60_000)
      markChatGptOAuthRateLimited(futureDate)
      expect(isChatGptOAuthRateLimited()).toBe(true)
    })

    test('rate limit expires after reset time', () => {
      const pastDate = new Date(Date.now() - 1_000)
      markChatGptOAuthRateLimited(pastDate)
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })

    test('resetChatGptOAuthRateLimit clears rate limit', () => {
      markChatGptOAuthRateLimited()
      expect(isChatGptOAuthRateLimited()).toBe(true)

      resetChatGptOAuthRateLimit()
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })
  })
})
