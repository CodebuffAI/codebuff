/**
 * Mock database helpers for testing billing functions with dependency injection.
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

/** Mock credit grant - requires essential fields. */
export type MockCreditGrant = Partial<CreditGrant> & {
  operation_id: string
  user_id: string
  principal: number
  balance: number
  type: GrantType
}

/** Mock user - requires id field. */
export type MockUser = Partial<BillingUser> & {
  id: string
}

/** Mock organization for org billing tests. */
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

/** Mock org member. */
export type MockOrgMember = {
  org_id: string
  user_id: string
  role?: string
}

/** Mock org repository. */
export type MockOrgRepo = {
  org_id: string
  repo_url: string
  repo_name?: string
  is_active?: boolean
}

/** Mock referral. */
export type MockReferral = {
  referrer_id: string
  referred_id: string
  credits: number
}

// ============================================================================
// Callback types for tracking database operations
// ============================================================================

/** Callback for insert operations. */
export type OnInsertCallback = (
  table: string,
  values: Record<string, unknown>,
) => void | Promise<void>

/** Callback for update operations. */
export type OnUpdateCallback = (
  table: string,
  values: Record<string, unknown>,
  where: unknown,
) => void | Promise<void>

// ============================================================================
// Mock database configuration
// ============================================================================

/** Configuration for creating a mock database. */
export interface MockDbConfig {
  users?: MockUser[]
  creditGrants?: MockCreditGrant[]
  organizations?: MockOrganization[]
  orgMembers?: MockOrgMember[]
  orgRepos?: MockOrgRepo[]
  referrals?: MockReferral[]
  onInsert?: OnInsertCallback
  onUpdate?: OnUpdateCallback
  throwOnInsert?: Error
  throwOnUpdate?: Error
}

// ============================================================================
// Query builder factory types
// ============================================================================

type OrgMemberQueryResult = {
  orgId: string
  orgName: string
  orgSlug: string
}

type OrgRepoQueryResult = {
  repoUrl: string
  repoName: string
  isActive: boolean
}

type ReferralSumResult = {
  totalCredits: string
}

// ============================================================================
// Mock database implementation
// ============================================================================

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

function createFromResult<T>(data: T[]): FromResult<T> {
  return {
    where: (): WhereResult<T> => createWhereResult(data),
    innerJoin: (): InnerJoinResult<T> => ({
      where: (): Promise<T[]> => Promise.resolve(data),
    }),
    then: <R>(cb: (rows: T[]) => R): R => cb(data),
  }
}

function createSelectBuilder<T>(data: T[]): SelectQueryBuilder<T> {
  return {
    from: (): FromResult<T> => createFromResult(data),
  }
}

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
 * **Limitation: Field-based Query Detection**
 *
 * This mock uses field inspection to determine what data to return from select queries.
 * The detection logic checks for specific field names in the select clause:
 * - `orgId` field → returns org member data
 * - `repoUrl` field → returns org repo data
 * - `totalCredits` field → returns referral sum data
 * - `principal` field → returns credit grant data
 *
 * If you add new queries with different field patterns, you may need to update the
 * `select()` implementation below to handle the new query type.
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

/** Creates a mock transaction function for testing. */
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

/** A tracked database operation for test assertions. */
export interface TrackedOperation {
  type: 'select' | 'insert' | 'update' | 'query'
  table?: string
  values?: Record<string, unknown>
  condition?: unknown
}

/** Result of createTrackedMockDb. */
export interface TrackedMockDbResult {
  db: BillingDbConnection
  operations: TrackedOperation[]
  getInserts: () => TrackedOperation[]
  getUpdates: () => TrackedOperation[]
  clear: () => void
}

/** Creates a mock database that tracks all operations for assertions. */
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
