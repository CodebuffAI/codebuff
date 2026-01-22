import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { afterEach, describe, expect, it } from 'bun:test'

import { triggerMonthlyResetAndGrant } from '../grant-credits'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

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
      where: () => ({
        orderBy: () => ({
          limit: () => [],
        }),
      }),
      then: (cb: any) => cb([]),
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
  }) => await callback(createTxMock(user)),
})

describe('grant-credits', () => {
  afterEach(() => {
    clearMockedModules()
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
  })
})
