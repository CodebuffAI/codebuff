import { describe, expect, it } from 'bun:test'

import { consumeCreditsWithDelegation } from '../credit-delegation'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('Credit Delegation', () => {
  // Note: findOrganizationForRepository tests require complex database mocking
  // that is better suited for integration tests or future DI refactoring.
  // The pure functions can still be tested here.

  describe('consumeCreditsWithDelegation', () => {
    it('should fail when no repository URL provided', async () => {
      const userId = 'user-123'
      const repositoryUrl = null
      const creditsToConsume = 100

      const result = await consumeCreditsWithDelegation({
        userId,
        repositoryUrl,
        creditsToConsume,
        logger,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No repository URL provided')
    })
  })
})
