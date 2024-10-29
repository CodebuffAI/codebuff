import { beforeAll, describe, expect, it, mock } from 'bun:test'
import {
  AnonymousQuotaManager,
  AuthenticatedQuotaManager,
} from '../../common/src/billing/quota-manager'
import { CREDITS_USAGE_LIMITS } from '../../common/src/constants'
import { SQL } from 'drizzle-orm'

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
                  creditsUsed: 500,
                  subscription_active: false,
                  quota: CREDITS_USAGE_LIMITS.FREE,
                  endDate: new Date(),
                },
              ]),
          }),
        }),
      }),
      where: () => ({
        groupBy: () => ({
          then: (callback: any) =>
            callback([
              {
                creditsUsed: 500,
                subscription_active: false,
                quota: CREDITS_USAGE_LIMITS.FREE,
                endDate: new Date(),
              },
            ]),
        }),
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => Promise.resolve(),
    }),
  }),
  insert: () => createChainableMock(undefined),
}

// Helper to create chainable mock
const createChainableMock = (returnValue: any) => {
  const chainable = {
    from: () => chainable,
    leftJoin: () => chainable,
    where: () => chainable,
    groupBy: () => chainable,
    then: (cb: any) => cb([returnValue]),
    select: () => chainable,
    update: () => chainable,
    set: () => chainable,
    values: () => chainable,
    insert: () => chainable,
    execute: () => Promise.resolve(),
  }
  return chainable
}

mock.module('../../common/src/db', () => ({
  default: mockDb,
}))

mock.module('../../common/src/db', () => ({
  default: mockDb,
}))

describe('QuotaManager', () => {
  describe('Client Display Messages', () => {
    it('should show correct message for subscribed users over quota', async () => {
      const quotaManager = new AuthenticatedQuotaManager()
      const result = await quotaManager.updateQuota('test-user-id')

      // Verify the response has all fields needed for client display
      expect(result).toHaveProperty('subscription_active')
      expect(result).toHaveProperty('creditsUsed')
      expect(result).toHaveProperty('quota')
    })
  })
  describe('Usage Response Flow', () => {
    it('should flow subscription status through calculateUsage', async () => {
      // Mock authenticated user with subscription
      mock.module('../../common/src/db', () => ({
        default: {
          select: mock(() => ({
            from: mock(() => ({
              leftJoin: mock(() => ({
                where: mock(() => ({
                  then: mock((callback) =>
                    callback([
                      {
                        credits: 500,
                        subscription_active: true,
                      },
                    ])
                  ),
                })),
              })),
            })),
          })),
        },
      }))

      const quotaManager = new AuthenticatedQuotaManager()
      const result = await quotaManager.updateQuota('test-user-id')

      expect(result.subscription_active).toBe(true)
      expect(result.creditsUsed).toBe(500)
      expect(result.quota).toBe(CREDITS_USAGE_LIMITS.FREE)
    })
  })
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
      expect(result.subscription_active).toBe(false)
    })

    it('should always return subscription_active as false', async () => {
      // Even with high usage
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
        },
      }))

      const result = await anonymousManager.updateQuota('test-fingerprint')
      expect(result.subscription_active).toBe(false)
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
