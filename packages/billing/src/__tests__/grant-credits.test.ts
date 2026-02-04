import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { afterEach, describe, expect, it } from 'bun:test'


import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
const _pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

const createTxMock = (user: {
  next_quota_reset: Date | null
  auto_topup_enabled: boolean | null
} | null) => ({
  query: {
    user: {
      findFirst: async () => user,
    },
  },
  update: () => ({
    set: () => ({
      where: () => Promise.resolve(),
    }),
  }),
  insert: () => ({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: () => Promise.resolve([{ id: 'test-id' }]),
      }),
    }),
  }),
  select: () => ({
    from: () => ({
      where: () => {
        // Create a thenable object that also supports orderBy for different code paths
        return {
          orderBy: () => ({
            limit: () => [],
          }),
          // Make this thenable for the .where().then() pattern used in grant-credits.ts
          then: (resolve: any, reject?: any) => Promise.resolve([]).then(resolve, reject),
        }
      },
    }),
  }),
  execute: () => Promise.resolve([]),
})

const createDbMock = (options: {
  user: {
    next_quota_reset: Date | null
    auto_topup_enabled: boolean | null
  } | null
}) => {
  const { user } = options

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => [],
          }),
        }),
      }),
    }),
  }
}

const createTransactionMock = (user: {
  next_quota_reset: Date | null
  auto_topup_enabled: boolean | null
} | null) => ({
  withAdvisoryLockTransaction: async ({
    callback,
  }: {
    callback: (tx: any) => Promise<any>
  }) => ({ result: await callback(createTxMock(user)), lockWaitMs: 0 }),
})

describe('grant-credits', () => {
  afterEach(() => {
    clearMockedModules()
  })

  describe('calculateTotalLegacyReferralBonus', () => {
    const createDbMockForReferralQuery = (totalCredits: string | null) => ({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ totalCredits }]),
        }),
      }),
    })

    const createDbMockThatThrows = (error: Error) => ({
      select: () => ({
        from: () => ({
          where: () => Promise.reject(error),
        }),
      }),
    })

    it('should return total credits when user has legacy referrals as referrer', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery('500'),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-123',
        logger,
      })

      expect(result).toBe(500)
    })

    it('should return total credits when user has legacy referrals as referred', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery('500'),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'referred-user',
        logger,
      })

      expect(result).toBe(500)
    })

    it('should return combined total when user has legacy referrals as both referrer and referred', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery('750'),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-with-both',
        logger,
      })

      expect(result).toBe(750)
    })

    it('should return 0 when user has no legacy referrals (only non-legacy)', async () => {
      // The query filters by is_legacy = true, so non-legacy referrals return 0
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery('0'),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-with-only-new-referrals',
        logger,
      })

      expect(result).toBe(0)
    })

    it('should return 0 when user has no referrals at all', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery('0'),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-with-no-referrals',
        logger,
      })

      expect(result).toBe(0)
    })

    it('should return 0 when query returns null (COALESCE handles this)', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery(null),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-null-result',
        logger,
      })

      expect(result).toBe(0)
    })

    it('should return 0 when query returns undefined result', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => Promise.resolve([]),
            }),
          }),
        },
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-empty-result',
        logger,
      })

      expect(result).toBe(0)
    })

    it('should return 0 and log error when database query fails', async () => {
      const dbError = new Error('Database connection failed')
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockThatThrows(dbError),
      }))

      const errorLogs: any[] = []
      const errorLogger: Logger = {
        ...logger,
        error: (...args: any[]) => {
          errorLogs.push(args)
        },
      }

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'user-db-error',
        logger: errorLogger,
      })

      expect(result).toBe(0)
      expect(errorLogs.length).toBe(1)
      expect(errorLogs[0][0]).toMatchObject({
        userId: 'user-db-error',
        error: dbError,
      })
    })

    it('should handle large credit values correctly', async () => {
      await mockModule('@codebuff/internal/db', () => ({
        default: createDbMockForReferralQuery('999999'),
      }))

      const { calculateTotalLegacyReferralBonus } = await import('../grant-credits')

      const result = await calculateTotalLegacyReferralBonus({
        userId: 'power-referrer',
        logger,
      })

      expect(result).toBe(999999)
    })
  })

  describe('triggerMonthlyResetAndGrant', () => {
    describe('autoTopupEnabled return value', () => {
      it('should return autoTopupEnabled: true when user has auto_topup_enabled: true', async () => {
        const user = {
          next_quota_reset: futureDate,
          auto_topup_enabled: true,
        }
        await mockModule('@codebuff/internal/db', () => ({
          default: createDbMock({ user }),
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMock(user),
        )

        // Need to re-import after mocking
        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        const result = await fn({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupEnabled).toBe(true)
        expect(result.quotaResetDate).toEqual(futureDate)
      })

      it('should return autoTopupEnabled: false when user has auto_topup_enabled: false', async () => {
        const user = {
          next_quota_reset: futureDate,
          auto_topup_enabled: false,
        }
        await mockModule('@codebuff/internal/db', () => ({
          default: createDbMock({ user }),
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMock(user),
        )

        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        const result = await fn({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupEnabled).toBe(false)
      })

      it('should default autoTopupEnabled to false when user has auto_topup_enabled: null', async () => {
        const user = {
          next_quota_reset: futureDate,
          auto_topup_enabled: null,
        }
        await mockModule('@codebuff/internal/db', () => ({
          default: createDbMock({ user }),
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMock(user),
        )

        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        const result = await fn({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupEnabled).toBe(false)
      })

      it('should throw error when user is not found', async () => {
        await mockModule('@codebuff/internal/db', () => ({
          default: createDbMock({ user: null }),
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMock(null),
        )

        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        await expect(
          fn({
            userId: 'nonexistent-user',
            logger,
          }),
        ).rejects.toThrow('User nonexistent-user not found')
      })
    })

    describe('quota reset behavior', () => {
      it('should return existing reset date when it is in the future', async () => {
        const user = {
          next_quota_reset: futureDate,
          auto_topup_enabled: false,
        }
        await mockModule('@codebuff/internal/db', () => ({
          default: createDbMock({ user }),
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMock(user),
        )

        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        const result = await fn({
          userId: 'user-123',
          logger,
        })

        expect(result.quotaResetDate).toEqual(futureDate)
      })
    })

    describe('legacy referral grants', () => {
      // Track grant operations to verify type and expiration
      let grantCalls: any[] = []

      const createTxMockWithGrants = (user: {
        next_quota_reset: Date | null
        auto_topup_enabled: boolean | null
      } | null, legacyReferralBonus: number) => {
        grantCalls = []
        return {
          query: {
            user: {
              findFirst: async () => user,
            },
          },
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
          insert: () => ({
            values: (values: any) => {
              grantCalls.push(values)
              return {
                onConflictDoNothing: () => ({
                  returning: () => Promise.resolve([{ id: 'test-id' }]),
                }),
              }
            },
          }),
          select: () => ({
            from: () => ({
              where: () => {
                // Create a thenable object that also supports orderBy for different code paths
                const result = [{ totalCredits: String(legacyReferralBonus) }]
                return {
                  orderBy: () => ({
                    limit: () => [],
                  }),
                  // Make this thenable for the .where().then() pattern used in grant-credits.ts
                  then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
                }
              },
            }),
          }),
          execute: () => Promise.resolve([]),
        }
      }

      const createTransactionMockWithGrants = (user: {
        next_quota_reset: Date | null
        auto_topup_enabled: boolean | null
      } | null, legacyReferralBonus: number) => ({
        withAdvisoryLockTransaction: async ({
          callback,
        }: {
          callback: (tx: any) => Promise<any>
        }) => ({ result: await callback(createTxMockWithGrants(user, legacyReferralBonus)), lockWaitMs: 0 }),
      })

      it('should grant referral_legacy type when user has legacy referrals and quota needs reset', async () => {
        const pastResetDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
        const user = {
          next_quota_reset: pastResetDate,
          auto_topup_enabled: false,
        }
        const legacyReferralBonus = 500

        // Mock db for both getPreviousFreeGrantAmount and calculateTotalLegacyReferralBonus
        // getPreviousFreeGrantAmount uses: db.select().from().where().orderBy().limit()
        // calculateTotalLegacyReferralBonus uses: db.select().from().where() (returns Promise)
        let queryCount = 0
        await mockModule('@codebuff/internal/db', () => ({
          default: {
            select: () => ({
              from: () => ({
                where: () => {
                  queryCount++
                  // First query is getPreviousFreeGrantAmount (needs orderBy chain)
                  // Second query is calculateTotalLegacyReferralBonus (returns Promise directly)
                  if (queryCount === 1) {
                    return {
                      orderBy: () => ({
                        limit: () => [], // No previous free grant, use default
                      }),
                    }
                  }
                  // Return referral bonus for calculateTotalLegacyReferralBonus
                  return Promise.resolve([{ totalCredits: String(legacyReferralBonus) }])
                },
              }),
            }),
          },
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMockWithGrants(user, legacyReferralBonus),
        )

        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        await fn({
          userId: 'user-with-legacy-referrals',
          logger,
        })

        // Should have made 2 grant calls (free + referral_legacy)
        expect(grantCalls.length).toBe(2)

        // Find the referral grant
        const referralGrant = grantCalls.find((call) => call.type === 'referral_legacy')
        expect(referralGrant).toBeDefined()
        expect(referralGrant.principal).toBe(legacyReferralBonus)
        expect(referralGrant.balance).toBe(legacyReferralBonus)
        expect(referralGrant.expires_at).toBeDefined() // Legacy referrals expire at next reset
        expect(referralGrant.description).toBe('Monthly referral bonus (legacy)')
      })

      it('should NOT grant referral credits when user has no legacy referrals', async () => {
        const pastResetDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
        const user = {
          next_quota_reset: pastResetDate,
          auto_topup_enabled: false,
        }
        const legacyReferralBonus = 0 // No legacy referrals

        // Mock db for both getPreviousFreeGrantAmount and calculateTotalLegacyReferralBonus
        let queryCount = 0
        await mockModule('@codebuff/internal/db', () => ({
          default: {
            select: () => ({
              from: () => ({
                where: () => {
                  queryCount++
                  // First query is getPreviousFreeGrantAmount (needs orderBy chain)
                  // Second query is calculateTotalLegacyReferralBonus (returns Promise directly)
                  if (queryCount === 1) {
                    return {
                      orderBy: () => ({
                        limit: () => [], // No previous free grant, use default
                      }),
                    }
                  }
                  // Return 0 referral bonus for calculateTotalLegacyReferralBonus
                  return Promise.resolve([{ totalCredits: String(legacyReferralBonus) }])
                },
              }),
            }),
          },
        }))
        await mockModule('@codebuff/internal/db/transaction', () =>
          createTransactionMockWithGrants(user, legacyReferralBonus),
        )

        const { triggerMonthlyResetAndGrant: fn } = await import('../grant-credits')

        await fn({
          userId: 'user-without-legacy-referrals',
          logger,
        })

        // Should only have made 1 grant call (free only, no referral)
        expect(grantCalls.length).toBe(1)

        // The only grant should be 'free' type
        expect(grantCalls[0].type).toBe('free')
      })
    })
  })
})
