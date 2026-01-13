/**
 * Tests for org-billing functions using dependency injection.
 */

import { describe, expect, it } from 'bun:test'

import {
  syncOrganizationBillingCycle,
  getOrderedActiveOrganizationGrants,
} from '../org-billing'
import { findOrganizationForRepository } from '../credit-delegation'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// ============================================================================
// Test Helpers
// ============================================================================

const createTestLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

const futureDate = (daysFromNow = 30) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)

const pastDate = (daysAgo = 30) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)

// ============================================================================
// syncOrganizationBillingCycle Tests
// ============================================================================

describe('syncOrganizationBillingCycle', () => {
  const logger = createTestLogger()

  it('should throw error when organization is not found', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => null,
        },
      },
    }

    await expect(
      syncOrganizationBillingCycle({
        organizationId: 'org-not-found',
        logger,
        deps: { db: mockDb as any },
      }),
    ).rejects.toThrow('Organization org-not-found not found')
  })

  it('should throw error when organization has no stripe_customer_id', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            stripe_customer_id: null,
            current_period_start: null,
            current_period_end: null,
          }),
        },
      },
    }

    await expect(
      syncOrganizationBillingCycle({
        organizationId: 'org-no-stripe',
        logger,
        deps: { db: mockDb as any },
      }),
    ).rejects.toThrow('Organization org-no-stripe does not have a Stripe customer ID')
  })

  it('should throw error when no active subscription found', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            stripe_customer_id: 'cus_org_123',
            current_period_start: null,
            current_period_end: null,
          }),
        },
      },
    }

    const mockStripe = {
      subscriptions: {
        list: async () => ({ data: [] }),
      },
    }

    await expect(
      syncOrganizationBillingCycle({
        organizationId: 'org-no-sub',
        logger,
        deps: { db: mockDb as any, stripeServer: mockStripe as any },
      }),
    ).rejects.toThrow('No active Stripe subscription found for organization org-no-sub')
  })

  it('should return current period start from Stripe subscription', async () => {
    const periodStart = new Date('2024-01-01T00:00:00Z')
    const periodEnd = new Date('2024-02-01T00:00:00Z')

    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            stripe_customer_id: 'cus_org_123',
            current_period_start: periodStart,
            current_period_end: periodEnd,
          }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    }

    const mockStripe = {
      subscriptions: {
        list: async () => ({
          data: [
            {
              current_period_start: Math.floor(periodStart.getTime() / 1000),
              current_period_end: Math.floor(periodEnd.getTime() / 1000),
            },
          ],
        }),
      },
    }

    const result = await syncOrganizationBillingCycle({
      organizationId: 'org-123',
      logger,
      deps: { db: mockDb as any, stripeServer: mockStripe as any },
    })

    expect(result.getTime()).toBe(periodStart.getTime())
  })

  it('should update org when billing cycle dates differ from Stripe', async () => {
    const oldPeriodStart = new Date('2024-01-01T00:00:00Z')
    const oldPeriodEnd = new Date('2024-02-01T00:00:00Z')
    const newPeriodStart = new Date('2024-02-01T00:00:00Z')
    const newPeriodEnd = new Date('2024-03-01T00:00:00Z')

    let updatedValues: any = null

    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            stripe_customer_id: 'cus_org_123',
            current_period_start: oldPeriodStart,
            current_period_end: oldPeriodEnd,
          }),
        },
      },
      update: () => ({
        set: (values: any) => {
          updatedValues = values
          return {
            where: () => Promise.resolve(),
          }
        },
      }),
    }

    const mockStripe = {
      subscriptions: {
        list: async () => ({
          data: [
            {
              current_period_start: Math.floor(newPeriodStart.getTime() / 1000),
              current_period_end: Math.floor(newPeriodEnd.getTime() / 1000),
            },
          ],
        }),
      },
    }

    await syncOrganizationBillingCycle({
      organizationId: 'org-123',
      logger,
      deps: { db: mockDb as any, stripeServer: mockStripe as any },
    })

    expect(updatedValues).not.toBeNull()
    expect(updatedValues.current_period_start.getTime()).toBe(newPeriodStart.getTime())
    expect(updatedValues.current_period_end.getTime()).toBe(newPeriodEnd.getTime())
  })
})

// ============================================================================
// getOrderedActiveOrganizationGrants Tests
// ============================================================================

describe('getOrderedActiveOrganizationGrants', () => {
  it('should use provided conn for database queries', async () => {
    const mockGrants = [
      {
        operation_id: 'grant-1',
        org_id: 'org-123',
        user_id: 'user-123',
        balance: 500,
        principal: 1000,
        priority: 50,
        type: 'organization' as const,
        description: 'Test grant 1',
        expires_at: futureDate(),
        created_at: new Date(),
      },
      {
        operation_id: 'grant-2',
        org_id: 'org-123',
        user_id: 'user-123',
        balance: 300,
        principal: 500,
        priority: 70,
        type: 'organization' as const,
        description: 'Test grant 2',
        expires_at: futureDate(),
        created_at: new Date(),
      },
    ]

    const mockConn = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(mockGrants),
          }),
        }),
      }),
    }

    const result = await getOrderedActiveOrganizationGrants({
      organizationId: 'org-123',
      now: new Date(),
      conn: mockConn as any,
    })

    expect(result).toEqual(mockGrants)
    expect(result.length).toBe(2)
  })

  it('should return empty array when no grants exist', async () => {
    const mockConn = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([]),
          }),
        }),
      }),
    }

    const result = await getOrderedActiveOrganizationGrants({
      organizationId: 'org-no-grants',
      now: new Date(),
      conn: mockConn as any,
    })

    expect(result).toEqual([])
  })
})

// ============================================================================
// findOrganizationForRepository Tests
// ============================================================================

describe('findOrganizationForRepository', () => {
  const logger = createTestLogger()

  it('should return found: false when URL cannot be parsed', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      }),
    }

    const result = await findOrganizationForRepository({
      userId: 'user-123',
      repositoryUrl: 'invalid-url',
      logger,
      deps: { db: mockDb as any },
    })

    expect(result.found).toBe(false)
  })

  it('should return found: false when user is not a member of any organizations', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      }),
    }

    const result = await findOrganizationForRepository({
      userId: 'user-123',
      repositoryUrl: 'https://github.com/test/repo',
      logger,
      deps: { db: mockDb as any },
    })

    expect(result.found).toBe(false)
  })

  it('should return found: true when matching repo is found in user org', async () => {
    // Track which queries are made
    let queryCount = 0

    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => {
              queryCount++
              // First call: return user's organizations
              if (queryCount === 1) {
                return Promise.resolve([
                  { orgId: 'org-123', orgName: 'Test Org', orgSlug: 'test-org' },
                ])
              }
              return Promise.resolve([])
            },
          }),
          where: () => {
            queryCount++
            // Second call: return org's repos
            return Promise.resolve([
              { repoUrl: 'https://github.com/test/repo', repoName: 'repo', isActive: true },
            ])
          },
        }),
      }),
    }

    const result = await findOrganizationForRepository({
      userId: 'user-123',
      repositoryUrl: 'https://github.com/test/repo',
      logger,
      deps: { db: mockDb as any },
    })

    expect(result.found).toBe(true)
    expect(result.organizationId).toBe('org-123')
    expect(result.organizationName).toBe('Test Org')
    expect(result.organizationSlug).toBe('test-org')
  })

  it('should return found: false when no matching repo in user orgs', async () => {
    let queryCount = 0

    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => {
              queryCount++
              if (queryCount === 1) {
                return Promise.resolve([
                  { orgId: 'org-123', orgName: 'Test Org', orgSlug: 'test-org' },
                ])
              }
              return Promise.resolve([])
            },
          }),
          where: () => {
            queryCount++
            // Return different repo
            return Promise.resolve([
              { repoUrl: 'https://github.com/other/repo', repoName: 'other-repo', isActive: true },
            ])
          },
        }),
      }),
    }

    const result = await findOrganizationForRepository({
      userId: 'user-123',
      repositoryUrl: 'https://github.com/test/repo',
      logger,
      deps: { db: mockDb as any },
    })

    expect(result.found).toBe(false)
  })

  it('should handle database errors gracefully', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => {
              throw new Error('Database connection failed')
            },
          }),
        }),
      }),
    }

    const result = await findOrganizationForRepository({
      userId: 'user-123',
      repositoryUrl: 'https://github.com/test/repo',
      logger,
      deps: { db: mockDb as any },
    })

    // Should return found: false instead of throwing
    expect(result.found).toBe(false)
  })
})
