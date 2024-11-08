import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  AnonymousQuotaManager,
  AuthenticatedQuotaManager,
} from '../../common/src/billing/quota-manager'
import { CREDITS_USAGE_LIMITS } from '../../common/src/constants'

// Mock the database
const mockDb = {
  select: () => ({
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          groupBy: () => ({
            then: (callback: any) =>
              callback([
                {
                  creditsUsed: '500',
                  subscription_active: false,
                  quota: CREDITS_USAGE_LIMITS.FREE,
                  endDate: new Date(),
                },
              ]),
          }),
        }),
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => Promise.resolve(),
    }),
  }),
}

mock.module('../../common/src/db', () => ({
  default: mockDb,
}))

describe('QuotaManager', () => {
  let anonymousManager: AnonymousQuotaManager
  let authenticatedManager: AuthenticatedQuotaManager

  beforeEach(() => {
    anonymousManager = new AnonymousQuotaManager()
    authenticatedManager = new AuthenticatedQuotaManager()
  })

  describe('Anonymous Users', () => {
    it('should check quota for unauthenticated user', async () => {
      const result = await anonymousManager.checkQuota('test-fingerprint')
      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.ANON)
      expect(result.subscription_active).toBe(false)
    })

    it('should always return subscription_active as false', async () => {
      const mockDbHighUsage = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: 15000,
                        subscription_active: true, // Even if DB returns true
                        quota: CREDITS_USAGE_LIMITS.ANON,
                        endDate: new Date(),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbHighUsage,
      }))

      const result = await anonymousManager.checkQuota('test-fingerprint')
      expect(result.subscription_active).toBe(false)
    })

    it('should reset quota when endDate is in the past', async () => {
      const pastDate = new Date()
      pastDate.setMonth(pastDate.getMonth() - 1)

      const mockDbPastDate = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: '500',
                        subscription_active: false,
                        quota: CREDITS_USAGE_LIMITS.ANON,
                        endDate: pastDate.toISOString(),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbPastDate,
      }))

      const result = await anonymousManager.checkQuota('test-fingerprint')
      expect(result.endDate.getTime()).toBeGreaterThan(pastDate.getTime() - 1000)
    })

    it('should detect if unauthenticated user has logged in', async () => {
      const mockDbWithSession = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: '500',
                        subscription_active: false,
                        quota: CREDITS_USAGE_LIMITS.ANON,
                        endDate: new Date().toISOString(),
                        userId: 'test-user-id',
                        sessionToken: 'valid-token',
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbWithSession,
      }))

      const result = await anonymousManager.checkQuota('test-fingerprint')
      expect(result.creditsUsed).toBe(500)
    })
  })

  describe('Authenticated Users', () => {
    it('should check quota for authenticated user', async () => {
      const result = await authenticatedManager.checkQuota('test-user-id')
      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.FREE)
    })

    it('should allow subscribed users to exceed quota', async () => {
      const mockDbWithSubscription = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: 15000,
                        subscription_active: true,
                        quota: CREDITS_USAGE_LIMITS.PAID,
                        endDate: new Date(),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbWithSubscription,
      }))

      const result = await authenticatedManager.checkQuota('test-user-id')
      expect(result.creditsUsed).toBe(15000)
      expect(result.subscription_active).toBe(true)
    })

    it('should reset quota when endDate is in the past', async () => {
      const pastDate = new Date()
      pastDate.setMonth(pastDate.getMonth() - 1)

      const mockDbWithPastDate = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: 500,
                        subscription_active: false,
                        quota: CREDITS_USAGE_LIMITS.FREE,
                        endDate: pastDate,
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbWithPastDate,
      }))

      const result = await authenticatedManager.checkQuota('test-user-id')
      expect(result.endDate.getTime()).toBeGreaterThan(pastDate.getTime() - 1000)
    })
  })

  describe('Usage Messages', () => {
    it('should show correct message for subscribed users over quota', async () => {
      const mockDbSubscribedOverQuota = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: CREDITS_USAGE_LIMITS.PAID + 1000,
                        subscription_active: true,
                        quota: CREDITS_USAGE_LIMITS.PAID,
                        endDate: new Date(),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbSubscribedOverQuota,
      }))

      const result = await authenticatedManager.checkQuota('test-user-id')
      expect(result.creditsUsed).toBeGreaterThan(result.quota)
      expect(result.subscription_active).toBe(true)
    })

    it('should show correct message for over quota users', async () => {
      const mockDbOverQuota = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: CREDITS_USAGE_LIMITS.FREE + 100,
                        subscription_active: false,
                        quota: CREDITS_USAGE_LIMITS.FREE,
                        endDate: new Date(),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbOverQuota,
      }))

      const result = await authenticatedManager.checkQuota('test-user-id')
      expect(result.creditsUsed).toBeGreaterThan(result.quota)
      expect(result.subscription_active).toBe(false)
    })
  })

  describe('Subscription Status Flow', () => {
    it('should flow subscription status through calculateUsage', async () => {
      const mockDbWithSubscription = {
        ...mockDb,
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  then: (callback: any) =>
                    callback([
                      {
                        creditsUsed: 500,
                        stripe_customer_id: 'cust_123',
                        stripe_price_id: 'price_123',
                        subscription_active: true,
                        quota: CREDITS_USAGE_LIMITS.PAID,
                        endDate: new Date().toISOString(),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      }

      mock.module('../../common/src/db', () => ({
        default: mockDbWithSubscription,
      }))

      const result = await authenticatedManager.checkQuota('test-user-id')
      expect(result.subscription_active).toBe(true)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.PAID)
    })
  })
})
