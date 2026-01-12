/**
 * Mock database helpers for testing billing functions with dependency injection.
 * 
 * This file provides utilities to create mock database connections that can be
 * injected into billing functions during tests, eliminating the need for mockModule.
 */

import type { GrantType } from '../types/grant'
import type { BillingDbConnection, CreditGrant, BillingUser } from '../types/contracts/billing'

// ============================================================================
// Mock data types
// ============================================================================

export type MockCreditGrant = Partial<CreditGrant> & {
  operation_id: string
  user_id: string
  principal: number
  balance: number
  type: GrantType
}

export type MockUser = Partial<BillingUser> & {
  id: string
}

export type MockOrganization = {
  id: string
  name?: string
  slug?: string
  stripe_customer_id?: string | null
  current_period_start?: Date | null
  current_period_end?: Date | null
  auto_topup_enabled?: boolean
  auto_topup_threshold?: number | null
  auto_topup_amount?: number | null
}

export type MockOrgMember = {
  org_id: string
  user_id: string
  role?: string
}

export type MockOrgRepo = {
  org_id: string
  repo_url: string
  repo_name?: string
  is_active?: boolean
}

export type MockReferral = {
  referrer_id: string
  referred_id: string
  credits: number
}

// ============================================================================
// Mock database configuration
// ============================================================================

export type MockDbConfig = {
  users?: MockUser[]
  creditGrants?: MockCreditGrant[]
  organizations?: MockOrganization[]
  orgMembers?: MockOrgMember[]
  orgRepos?: MockOrgRepo[]
  referrals?: MockReferral[]
  
  // Behavior overrides
  onInsert?: (table: string, values: any) => void | Promise<void>
  onUpdate?: (table: string, values: any, where: any) => void | Promise<void>
  throwOnInsert?: Error
  throwOnUpdate?: Error
}

// ============================================================================
// Mock database implementation
// ============================================================================

/**
 * Creates a mock database connection for testing billing functions.
 * 
 * @example
 * ```typescript
 * const mockDb = createMockDb({
 *   users: [{
 *     id: 'user-123',
 *     next_quota_reset: futureDate,
 *     auto_topup_enabled: true,
 *   }],
 *   creditGrants: [{
 *     operation_id: 'grant-1',
 *     user_id: 'user-123',
 *     principal: 1000,
 *     balance: 800,
 *     type: 'free',
 *   }]
 * })
 * 
 * const result = await triggerMonthlyResetAndGrant({
 *   userId: 'user-123',
 *   logger: testLogger,
 *   deps: { db: mockDb }
 * })
 * ```
 */
export function createMockDb(config: MockDbConfig = {}): BillingDbConnection {
  const {
    users = [],
    creditGrants = [],
    organizations = [],
    orgMembers = [],
    orgRepos = [],
    referrals = [],
    onInsert,
    onUpdate,
    throwOnInsert,
    throwOnUpdate,
  } = config

  // Helper to create a chainable select builder
  const createSelectBuilder = (data: any[]) => ({
    from: () => ({
      where: (condition?: any) => ({
        orderBy: () => ({
          limit: (n: number) => data.slice(0, n),
          then: (cb: (rows: any[]) => any) => cb(data),
        }),
        groupBy: () => ({
          orderBy: () => ({
            limit: (n: number) => data.slice(0, n),
          }),
        }),
        limit: (n: number) => data.slice(0, n),
        then: (cb: (rows: any[]) => any) => cb(data),
      }),
      innerJoin: () => ({
        where: (condition?: any) => Promise.resolve(data),
      }),
      then: (cb: (rows: any[]) => any) => cb(data),
    }),
  })

  // Helper to create a chainable insert builder
  const createInsertBuilder = () => ({
    values: async (values: any) => {
      if (throwOnInsert) throw throwOnInsert
      if (onInsert) await onInsert('creditLedger', values)
      return Promise.resolve()
    },
  })

  // Helper to create a chainable update builder
  const createUpdateBuilder = () => ({
    set: (values: any) => ({
      where: async (condition?: any) => {
        if (throwOnUpdate) throw throwOnUpdate
        if (onUpdate) await onUpdate('creditLedger', values, condition)
        return Promise.resolve()
      },
    }),
  })

  return {
    select: (fields?: any) => {
      // Determine what data to return based on the fields being selected
      if (fields && 'orgId' in fields) {
        // Org member query
        const memberData = orgMembers.map(m => {
          const org = organizations.find(o => o.id === m.org_id)
          return {
            orgId: m.org_id,
            orgName: org?.name ?? 'Test Org',
            orgSlug: org?.slug ?? 'test-org',
          }
        })
        return createSelectBuilder(memberData)
      }
      if (fields && 'repoUrl' in fields) {
        // Org repo query
        const repoData = orgRepos.map(r => ({
          repoUrl: r.repo_url,
          repoName: r.repo_name ?? 'test-repo',
          isActive: r.is_active ?? true,
        }))
        return createSelectBuilder(repoData)
      }
      if (fields && 'totalCredits' in fields) {
        // Referral sum query
        const total = referrals.reduce((sum, r) => sum + r.credits, 0)
        return createSelectBuilder([{ totalCredits: total.toString() }])
      }
      if (fields && 'principal' in fields) {
        // Credit grant query
        return createSelectBuilder(creditGrants)
      }
      // Default: return credit grants
      return createSelectBuilder(creditGrants)
    },
    
    insert: () => createInsertBuilder(),
    
    update: () => createUpdateBuilder(),
    
    query: {
      user: {
        findFirst: async (params: any) => {
          const user = users[0]
          if (!user) return null
          
          // Return only requested columns if specified
          if (params?.columns) {
            const result: any = {}
            for (const col of Object.keys(params.columns)) {
              result[col] = (user as any)[col]
            }
            return result
          }
          return user
        },
      },
      creditLedger: {
        findFirst: async (params: any) => {
          return creditGrants[0] ?? null
        },
      },
    },
  }
}

/**
 * Creates a mock transaction function for testing.
 * The transaction simply executes the callback with a mock db.
 */
export function createMockTransaction(config: MockDbConfig = {}) {
  return async <T>(callback: (tx: BillingDbConnection) => Promise<T>): Promise<T> => {
    const mockDb = createMockDb(config)
    return callback(mockDb)
  }
}

/**
 * Creates a mock db that tracks all operations for assertions.
 */
export type TrackedOperation = {
  type: 'select' | 'insert' | 'update' | 'query'
  table?: string
  values?: any
  condition?: any
}

export function createTrackedMockDb(config: MockDbConfig = {}) {
  const operations: TrackedOperation[] = []
  
  const mockDb = createMockDb({
    ...config,
    onInsert: (table, values) => {
      operations.push({ type: 'insert', table, values })
      config.onInsert?.(table, values)
    },
    onUpdate: (table, values, condition) => {
      operations.push({ type: 'update', table, values, condition })
      config.onUpdate?.(table, values, condition)
    },
  })
  
  return {
    db: mockDb,
    operations,
    getInserts: () => operations.filter(op => op.type === 'insert'),
    getUpdates: () => operations.filter(op => op.type === 'update'),
    clear: () => { operations.length = 0 },
  }
}
