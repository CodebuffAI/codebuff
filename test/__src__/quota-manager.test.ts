import { beforeAll, describe, expect, it, mock } from 'bun:test'
import {
  AnonymousQuotaManager,
  AuthenticatedQuotaManager,
} from '../../common/src/billing/quota-manager'
import { CREDITS_USAGE_LIMITS } from '../../common/src/constants'
import { SQL } from 'drizzle-orm'

// Mock the database
mock.module('../../common/src/db', () => ({
  default: {
    select: mock(() => ({
      from: mock(() => ({
        leftJoin: mock(() => ({
          where: mock(() => ({
            then: mock((callback) => callback([{ credits: 500 }])),
            groupBy: mock(() => ({
              limit: mock(() => ({
                then: mock((callback) => callback([{ credits: 500 }])),
              })),
            })),
          })),
        })),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          execute: mock(),
        })),
      })),
    })),
  },
}))

describe('QuotaManager', () => {
  let anonymousManager: AnonymousQuotaManager
  let authenticatedManager: AuthenticatedQuotaManager

  beforeAll(() => {
    anonymousManager = new AnonymousQuotaManager()
    authenticatedManager = new AuthenticatedQuotaManager()
  })

  describe('AnonymousQuotaManager', () => {
    it('should check quota for anonymous user', async () => {
      const result = await anonymousManager.checkQuota('test-fingerprint')

      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.ANON)
      expect(result.endDate).toBeInstanceOf(SQL)
    })

    it('should update quota for anonymous user', async () => {
      const result = await anonymousManager.updateQuota('test-fingerprint')

      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.ANON)
    })

    it('should reset quota for anonymous user', async () => {
      await anonymousManager.resetQuota('test-fingerprint')
      // We can't easily test if the method was called, so we'll just check it doesn't throw
    })
  })

  describe('AuthenticatedQuotaManager', () => {
    it('should check quota for authenticated user', async () => {
      const result = await authenticatedManager.checkQuota('test-user-id')

      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.FREE)
      expect(result.endDate).toBeInstanceOf(SQL)
    })

    it('should update quota for authenticated user', async () => {
      const result = await authenticatedManager.updateQuota('test-user-id')

      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.FREE)
      expect(result.subscription_active).toBe(false)
    })

    it('should allow subscribed users to exceed quota', async () => {
      // Mock the DB to return a subscribed user
      mock.module('../../common/src/db', () => ({
        default: {
          select: mock(() => ({
            from: mock(() => ({
              leftJoin: mock(() => ({
                where: mock(() => ({
                  then: mock((callback) => callback([{ credits: 15000 }])),
                  groupBy: mock(() => ({
                    limit: mock(() => ({
                      then: mock((callback) => callback([{ credits: 15000 }])),
                    })),
                  })),
                })),
              })),
            })),
          })),
          update: mock(() => ({
            set: mock(() => ({
              where: mock(() => ({
                execute: mock(),
              })),
            })),
          })),
        },
      }))

      const result = await authenticatedManager.updateQuota('test-user-id')

      expect(result.creditsUsed).toBe(15000)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.FREE)
      expect(result.subscription_active).toBe(true)
    })

    it('should reset quota for authenticated user', async () => {
      await authenticatedManager.resetQuota('test-user-id')
      // We can't easily test if the method was called, so we'll just check it doesn't throw
    })
  })
})
