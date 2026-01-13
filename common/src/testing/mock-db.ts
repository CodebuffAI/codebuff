/**
 * Mock database helpers for testing billing functions with dependency injection.
 * 
 * This file provides utilities to create mock database connections that can be
 * injected into billing functions during tests, eliminating the need for mockModule.
 * 
 * @example
 * ```typescript
 * import { createMockDb, createMockTransaction } from '@codebuff/common/testing/mock-db'
 * import { createMockUser, createMockCreditGrant } from '@codebuff/common/testing/fixtures'
 * 
 * const mockDb = createMockDb({
 *   users: [createMockUser({ id: 'user-123' })],
 *   creditGrants: [createMockCreditGrant({ user_id: 'user-123', balance: 500 })],
 * })
 * 
 * const result = await myBillingFunction({ deps: { db: mockDb } })
 * ```
 */

import type { GrantType } from '../types/grant'
import type {
  BillingDbConnection,
  BillingOrganization,
  BillingUser,
  CreditGrant,
  FindFirstParams,
  FromResult,
  GroupByResult,
  InnerJoinResult,
  InsertQueryBuilder,
  OrderByResult,
  SelectQueryBuilder,
  TableQuery,
  UpdateQueryBuilder,
  UpdateSetResult,
  WhereResult,
} from '../types/contracts/billing'

// ============================================================================
// Mock data types
// ============================================================================

/**
 * Mock credit grant type - requires essential fields, allows partial others.
 * Use `createMockCreditGrant` from fixtures for convenient creation.
 */
export type MockCreditGrant = Partial<CreditGrant> & {
  operation_id: string
  user_id: string
  principal: number
  balance: number
  type: GrantType
}

/**
 * Mock user type - requires id, allows partial other billing fields.
 * Use `createMockUser` from fixtures for convenient creation.
 */
export type MockUser = Partial<BillingUser> & {
  id: string
}

/**
 * Mock organization for testing org billing flows.
 */
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

/**
 * Mock organization member for testing org membership.
 */
export type MockOrgMember = {
  org_id: string
  user_id: string
  role?: string
}

/**
 * Mock organization repository for testing repo-org associations.
 */
export type MockOrgRepo = {
  org_id: string
  repo_url: string
  repo_name?: string
  is_active?: boolean
}

/**
 * Mock referral for testing referral credit calculations.
 */
export type MockReferral = {
  referrer_id: string
  referred_id: string
  credits: number
}

// ============================================================================
// Callback types for tracking database operations
// ============================================================================

/**
 * Callback invoked when an insert operation occurs.
 * @param table - The table name being inserted into
 * @param values - The values being inserted
 */
export type OnInsertCallback = (
  table: string,
  values: Record<string, unknown>,
) => void | Promise<void>

/**
 * Callback invoked when an update operation occurs.
 * @param table - The table name being updated
 * @param values - The values being set
 * @param where - The where condition (if any)
 */
export type OnUpdateCallback = (
  table: string,
  values: Record<string, unknown>,
  where: unknown,
) => void | Promise<void>

// ============================================================================
// Mock database configuration
// ============================================================================

/**
 * Configuration for creating a mock database.
 * Provide test data and optional behavior overrides.
 * 
 * @example
 * ```typescript
 * const config: MockDbConfig = {
 *   users: [{ id: 'user-1', auto_topup_enabled: true }],
 *   creditGrants: [{ operation_id: 'grant-1', user_id: 'user-1', ... }],
 *   onInsert: (table, values) => console.log(`Inserted into ${table}:`, values),
 * }
 * ```
 */
export interface MockDbConfig {
  /** Mock user records */
  users?: MockUser[]
  /** Mock credit grant records */
  creditGrants?: MockCreditGrant[]
  /** Mock organization records */
  organizations?: MockOrganization[]
  /** Mock organization member records */
  orgMembers?: MockOrgMember[]
  /** Mock organization repository records */
  orgRepos?: MockOrgRepo[]
  /** Mock referral records */
  referrals?: MockReferral[]
  
  // Behavior overrides
  /** Callback when insert is called - useful for tracking inserts in tests */
  onInsert?: OnInsertCallback
  /** Callback when update is called - useful for tracking updates in tests */
  onUpdate?: OnUpdateCallback
  /** Error to throw on insert - useful for testing error handling */
  throwOnInsert?: Error
  /** Error to throw on update - useful for testing error handling */
  throwOnUpdate?: Error
}

// ============================================================================
// Query builder factory types
// ============================================================================

/**
 * Internal type for org member query results.
 */
type OrgMemberQueryResult = {
  orgId: string
  orgName: string
  orgSlug: string
}

/**
 * Internal type for org repo query results.
 */
type OrgRepoQueryResult = {
  repoUrl: string
  repoName: string
  isActive: boolean
}

/**
 * Internal type for referral sum query results.
 */
type ReferralSumResult = {
  totalCredits: string
}

// ============================================================================
// Mock database implementation
// ============================================================================

/**
 * Creates a type-safe WhereResult for query chaining.
 * @internal
 */
function createWhereResult<T>(data: T[]): WhereResult<T> {
  return {
    orderBy: (): OrderByResult<T> => ({
      limit: (n: number): T[] => data.slice(0, n),
      then: <R>(cb: (rows: T[]) => R): R => cb(data),
    }),
    groupBy: (): GroupByResult<T> => ({
      orderBy: (): OrderByResult<T> => ({
        limit: (n: number): T[] => data.slice(0, n),
        then: <R>(cb: (rows: T[]) => R): R => cb(data),
      }),
    }),
    limit: (n: number): T[] => data.slice(0, n),
    then: <R>(cb: (rows: T[]) => R): R => cb(data),
  }
}

/**
 * Creates a type-safe FromResult for query chaining.
 * @internal
 */
function createFromResult<T>(data: T[]): FromResult<T> {
  return {
    where: (): WhereResult<T> => createWhereResult(data),
    innerJoin: (): InnerJoinResult<T> => ({
      where: (): Promise<T[]> => Promise.resolve(data),
    }),
    then: <R>(cb: (rows: T[]) => R): R => cb(data),
  }
}

/**
 * Creates a type-safe SelectQueryBuilder.
 * @internal
 */
function createSelectBuilder<T>(data: T[]): SelectQueryBuilder<T> {
  return {
    from: (): FromResult<T> => createFromResult(data),
  }
}

/**
 * Creates a type-safe InsertQueryBuilder.
 * @internal
 */
function createInsertBuilder<T>(
  onInsert: OnInsertCallback | undefined,
  throwOnInsert: Error | undefined,
): InsertQueryBuilder<T> {
  return {
    values: async (values: T | T[]): Promise<void> => {
      if (throwOnInsert) throw throwOnInsert
      if (onInsert) await onInsert('creditLedger', values as Record<string, unknown>)
    },
  }
}

/**
 * Creates a type-safe UpdateQueryBuilder.
 * @internal
 */
function createUpdateBuilder<T>(
  onUpdate: OnUpdateCallback | undefined,
  throwOnUpdate: Error | undefined,
): UpdateQueryBuilder<T> {
  return {
    set: (values: Partial<T>): UpdateSetResult => ({
      where: async (condition?: unknown): Promise<void> => {
        if (throwOnUpdate) throw throwOnUpdate
        if (onUpdate) await onUpdate('creditLedger', values as Record<string, unknown>, condition)
      },
    }),
  }
}

/**
 * Creates a type-safe TableQuery for findFirst operations.
 * @internal
 */
function createTableQuery<T>(data: T[]): TableQuery<T> {
  return {
    findFirst: async (params?: FindFirstParams<T>): Promise<T | null> => {
      const record = data[0]
      if (!record) return null
      
      // Return only requested columns if specified
      if (params?.columns) {
        const result = {} as Partial<T>
        for (const col of Object.keys(params.columns) as (keyof T)[]) {
          result[col] = record[col]
        }
        return result as T
      }
      return record
    },
  }
}

/**
 * Creates a mock database connection for testing billing functions.
 * 
 * The mock database provides type-safe query builders that match the real
 * Drizzle ORM interface, allowing tests to verify billing logic without
 * hitting a real database.
 * 
 * @param config - Configuration with mock data and behavior overrides
 * @returns A BillingDbConnection that can be injected into billing functions
 * 
 * @example
 * ```typescript
 * // Basic usage with mock data
 * const mockDb = createMockDb({
 *   users: [{
 *     id: 'user-123',
 *     next_quota_reset: new Date('2024-02-01'),
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
 * 
 * @example
 * ```typescript
 * // Tracking inserts for assertions
 * const insertedGrants: unknown[] = []
 * const mockDb = createMockDb({
 *   users: [createMockUser()],
 *   onInsert: (table, values) => {
 *     insertedGrants.push(values)
 *   },
 * })
 * 
 * await grantCredits({ deps: { db: mockDb } })
 * expect(insertedGrants).toHaveLength(1)
 * ```
 * 
 * @example
 * ```typescript
 * // Testing error handling
 * const mockDb = createMockDb({
 *   throwOnInsert: new Error('Database unavailable'),
 * })
 * 
 * await expect(grantCredits({ deps: { db: mockDb } })).rejects.toThrow('Database unavailable')
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

  return {
    select: <T = unknown>(fields?: Record<string, unknown>): SelectQueryBuilder<T> => {
      // Determine what data to return based on the fields being selected
      if (fields && 'orgId' in fields) {
        // Org member query
        const memberData: OrgMemberQueryResult[] = orgMembers.map(m => {
          const org = organizations.find(o => o.id === m.org_id)
          return {
            orgId: m.org_id,
            orgName: org?.name ?? 'Test Org',
            orgSlug: org?.slug ?? 'test-org',
          }
        })
        return createSelectBuilder(memberData) as SelectQueryBuilder<T>
      }
      if (fields && 'repoUrl' in fields) {
        // Org repo query
        const repoData: OrgRepoQueryResult[] = orgRepos.map(r => ({
          repoUrl: r.repo_url,
          repoName: r.repo_name ?? 'test-repo',
          isActive: r.is_active ?? true,
        }))
        return createSelectBuilder(repoData) as SelectQueryBuilder<T>
      }
      if (fields && 'totalCredits' in fields) {
        // Referral sum query
        const total = referrals.reduce((sum, r) => sum + r.credits, 0)
        const sumData: ReferralSumResult[] = [{ totalCredits: total.toString() }]
        return createSelectBuilder(sumData) as SelectQueryBuilder<T>
      }
      if (fields && 'principal' in fields) {
        // Credit grant query
        return createSelectBuilder(creditGrants) as SelectQueryBuilder<T>
      }
      // Default: return credit grants
      return createSelectBuilder(creditGrants) as SelectQueryBuilder<T>
    },
    
    insert: <T = unknown>(): InsertQueryBuilder<T> => createInsertBuilder<T>(onInsert, throwOnInsert),
    
    update: <T = unknown>(): UpdateQueryBuilder<T> => createUpdateBuilder<T>(onUpdate, throwOnUpdate),
    
    query: {
      user: createTableQuery<BillingUser>(users as BillingUser[]),
      creditLedger: createTableQuery<CreditGrant>(creditGrants as CreditGrant[]),
      org: createTableQuery<BillingOrganization>(organizations as BillingOrganization[]),
    },
  }
}

/**
 * Creates a mock transaction function for testing.
 * 
 * The transaction executes the callback with a mock db, simulating
 * how real Drizzle transactions work.
 * 
 * @param config - Configuration with mock data and behavior overrides
 * @returns A transaction function that can be injected as `deps.transaction`
 * 
 * @example
 * ```typescript
 * const mockTransaction = createMockTransaction({
 *   users: [createMockUser({ next_quota_reset: futureDate })],
 * })
 * 
 * const result = await triggerMonthlyResetAndGrant({
 *   userId: 'user-123',
 *   logger: testLogger,
 *   deps: { transaction: mockTransaction },
 * })
 * ```
 */
export function createMockTransaction(
  config: MockDbConfig = {},
): <T>(callback: (tx: BillingDbConnection) => Promise<T>) => Promise<T> {
  return async <T>(callback: (tx: BillingDbConnection) => Promise<T>): Promise<T> => {
    const mockDb = createMockDb(config)
    return callback(mockDb)
  }
}

// ============================================================================
// Tracked mock database for assertions
// ============================================================================

/**
 * Represents a tracked database operation for test assertions.
 */
export interface TrackedOperation {
  /** Type of operation performed */
  type: 'select' | 'insert' | 'update' | 'query'
  /** Table the operation was performed on */
  table?: string
  /** Values being inserted or updated */
  values?: Record<string, unknown>
  /** Where condition for updates */
  condition?: unknown
}

/**
 * Result of createTrackedMockDb - provides the mock db and operation tracking.
 */
export interface TrackedMockDbResult {
  /** The mock database connection */
  db: BillingDbConnection
  /** All tracked operations */
  operations: TrackedOperation[]
  /** Get only insert operations */
  getInserts: () => TrackedOperation[]
  /** Get only update operations */
  getUpdates: () => TrackedOperation[]
  /** Clear all tracked operations */
  clear: () => void
}

/**
 * Creates a mock database that tracks all operations for assertions.
 * 
 * Use this when you need to verify specific database operations were called
 * with expected values.
 * 
 * @param config - Configuration with mock data and behavior overrides
 * @returns Object containing the mock db and tracking utilities
 * 
 * @example
 * ```typescript
 * const { db, operations, getInserts, getUpdates, clear } = createTrackedMockDb({
 *   users: [createMockUser()],
 * })
 * 
 * await someFunction({ deps: { db } })
 * 
 * // Assert on specific operations
 * expect(getInserts()).toHaveLength(1)
 * expect(getInserts()[0].values).toMatchObject({
 *   user_id: 'user-123',
 *   type: 'free',
 * })
 * 
 * // Clear between tests
 * clear()
 * ```
 */
export function createTrackedMockDb(config: MockDbConfig = {}): TrackedMockDbResult {
  const operations: TrackedOperation[] = []
  
  const mockDb = createMockDb({
    ...config,
    onInsert: (table: string, values: Record<string, unknown>) => {
      operations.push({ type: 'insert', table, values })
      config.onInsert?.(table, values)
    },
    onUpdate: (table: string, values: Record<string, unknown>, condition: unknown) => {
      operations.push({ type: 'update', table, values, condition })
      config.onUpdate?.(table, values, condition)
    },
  })
  
  return {
    db: mockDb,
    operations,
    getInserts: (): TrackedOperation[] => operations.filter(op => op.type === 'insert'),
    getUpdates: (): TrackedOperation[] => operations.filter(op => op.type === 'update'),
    clear: (): void => { operations.length = 0 },
  }
}
