import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'

import {
  calculateOrganizationUsageAndBalance,
  consumeOrganizationCredits,
  grantOrganizationCredits,
  normalizeRepositoryUrl,
  validateAndNormalizeRepositoryUrl,
} from '../org-billing'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// Mock the database
const mockGrants = [
  {
    operation_id: 'org-grant-1',
    user_id: '',
    organization_id: 'org-123',
    principal: 1000,
    balance: 800,
    type: 'organization' as const,
    description: 'Organization credits',
    priority: 60,
    expires_at: new Date('2024-12-31'),
    created_at: new Date('2024-01-01'),
  },
  {
    operation_id: 'org-grant-2',
    user_id: '',
    organization_id: 'org-123',
    principal: 500,
    balance: -100, // Debt
    type: 'organization' as const,
    description: 'Organization credits with debt',
    priority: 60,
    expires_at: new Date('2024-11-30'),
    created_at: new Date('2024-02-01'),
  },
]

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const createDbMock = (options?: {
  grants?: typeof mockGrants | any[]
  insert?: () => { values: () => Promise<unknown> }
  update?: () => { set: () => { where: () => Promise<unknown> } }
}) => {
  const { grants = mockGrants, insert, update } = options ?? {}

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => grants,
        }),
      }),
    }),
    insert:
      insert ??
      (() => ({
        values: () => Promise.resolve(),
      })),
    update:
      update ??
      (() => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      })),
  }
}

describe('Organization Billing', () => {
  beforeAll(async () => {
    await mockModule('@codebuff/common/db', () => ({
      default: createDbMock(),
    }))

    await mockModule('@codebuff/common/db/transaction', () => ({
      withSerializableTransaction: async ({
        callback,
      }: {
        callback: (tx: any) => Promise<unknown> | unknown
      }) => await callback(createDbMock()),
    }))
  })

  afterAll(() => {
    clearMockedModules()
  })

  afterEach(async () => {
    await mockModule('@codebuff/common/db', () => ({
      default: createDbMock(),
    }))
  })

  describe('calculateOrganizationUsageAndBalance', () => {
    it('should calculate balance correctly with positive and negative balances', async () => {
      const organizationId = 'org-123'
      const quotaResetDate = new Date('2024-01-01')
      const now = new Date('2024-06-01')

      const result = await calculateOrganizationUsageAndBalance({
        organizationId,
        quotaResetDate,
        now,
        logger,
      })

      // Total positive balance: 800
      // Total debt: 100
      // Net balance after settlement: 700
      expect(result.balance.totalRemaining).toBe(700)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(700)

      // Usage calculation: (1000 - 800) + (500 - (-100)) = 200 + 600 = 800
      expect(result.usageThisCycle).toBe(800)
    })

    it('should handle organization with no grants', async () => {
      // Mock empty grants
      await mockModule('@codebuff/common/db', () => ({
        default: createDbMock({ grants: [] }),
      }))

      const organizationId = 'org-empty'
      const quotaResetDate = new Date('2024-01-01')
      const now = new Date('2024-06-01')

      const result = await calculateOrganizationUsageAndBalance({
        organizationId,
        quotaResetDate,
        now,
        logger,
      })

      expect(result.balance.totalRemaining).toBe(0)
      expect(result.balance.totalDebt).toBe(0)
      expect(result.balance.netBalance).toBe(0)
      expect(result.usageThisCycle).toBe(0)
    })
  })

  describe('normalizeRepositoryUrl', () => {
    it('should normalize GitHub URLs correctly', () => {
      expect(normalizeRepositoryUrl('https://github.com/user/repo.git')).toBe(
        'https://github.com/user/repo',
      )

      expect(normalizeRepositoryUrl('git@github.com:user/repo.git')).toBe(
        'https://github.com/user/repo',
      )

      expect(normalizeRepositoryUrl('github.com/user/repo')).toBe(
        'https://github.com/user/repo',
      )

      expect(normalizeRepositoryUrl('HTTPS://GITHUB.COM/USER/REPO')).toBe(
        'https://github.com/user/repo',
      )
    })

    it('should handle various URL formats', () => {
      expect(normalizeRepositoryUrl('https://gitlab.com/user/repo.git')).toBe(
        'https://gitlab.com/user/repo',
      )

      expect(normalizeRepositoryUrl('  https://github.com/user/repo  ')).toBe(
        'https://github.com/user/repo',
      )
    })
  })

  describe('validateAndNormalizeRepositoryUrl', () => {
    it('should validate and normalize valid URLs', () => {
      const result = validateAndNormalizeRepositoryUrl(
        'https://github.com/user/repo',
      )
      expect(result.isValid).toBe(true)
      expect(result.normalizedUrl).toBe('https://github.com/user/repo')
      expect(result.error).toBeUndefined()
    })

    it('should reject invalid domains', () => {
      const result = validateAndNormalizeRepositoryUrl(
        'https://example.com/user/repo',
      )
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Repository domain not allowed')
    })

    it('should reject malformed URLs', () => {
      const result = validateAndNormalizeRepositoryUrl('not-a-url')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Repository domain not allowed')
    })

    it('should accept allowed domains', () => {
      const domains = ['github.com', 'gitlab.com', 'bitbucket.org']

      domains.forEach((domain) => {
        const result = validateAndNormalizeRepositoryUrl(
          `https://${domain}/user/repo`,
        )
        expect(result.isValid).toBe(true)
        expect(result.normalizedUrl).toBe(`https://${domain}/user/repo`)
      })
    })
  })

  describe('consumeOrganizationCredits', () => {
    it('should consume credits from organization grants', async () => {
      const organizationId = 'org-123'
      const creditsToConsume = 100

      const result = await consumeOrganizationCredits({
        organizationId,
        creditsToConsume,
        logger,
      })

      expect(result.consumed).toBe(100)
      expect(result.fromPurchased).toBe(0) // Organization credits are not "purchased" type
    })
  })

  describe('grantOrganizationCredits', () => {
    it('should create organization credit grant', async () => {
      const organizationId = 'org-123'
      const userId = 'user-123'
      const amount = 1000
      const operationId = 'test-operation-123'
      const description = 'Test organization credits'

      // Should not throw
      await expect(
        grantOrganizationCredits({
          organizationId,
          userId,
          amount,
          operationId,
          description,
          logger,
        }),
      ).resolves.toBeUndefined()
    })

    it('should handle duplicate operation IDs gracefully', async () => {
      // Mock database constraint error
      await mockModule('@codebuff/common/db', () => ({
        default: createDbMock({
          insert: () => ({
            values: () => {
              const error = new Error('Duplicate key')
              ;(error as any).code = '23505'
              ;(error as any).constraint = 'credit_ledger_pkey'
              throw error
            },
          }),
        }),
      }))

      const organizationId = 'org-123'
      const userId = 'user-123'
      const amount = 1000
      const operationId = 'duplicate-operation'
      const description = 'Duplicate test'

      // Should not throw, should handle gracefully
      await expect(
        grantOrganizationCredits({
          organizationId,
          userId,
          amount,
          operationId,
          description,
          logger,
        }),
      ).resolves.toBeUndefined()
    })
  })
})
