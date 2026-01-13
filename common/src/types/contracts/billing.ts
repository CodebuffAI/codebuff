import type { Logger } from './logger'
import type { ErrorOr } from '../../util/error'
import type { GrantType } from '../grant'

// ============================================================================
// Database types for billing operations
// ============================================================================

/**
 * Credit grant as stored in the database
 */
export type CreditGrant = {
  operation_id: string
  user_id: string
  org_id: string | null
  principal: number
  balance: number
  type: GrantType
  description: string
  priority: number
  expires_at: Date | null
  created_at: Date
}

/**
 * User record fields relevant to billing
 */
export type BillingUser = {
  id: string
  next_quota_reset: Date | null
  auto_topup_enabled: boolean | null
  auto_topup_threshold: number | null
  auto_topup_amount: number | null
  stripe_customer_id: string | null
}

/**
 * Referral record for calculating bonuses
 */
export type Referral = {
  referrer_id: string
  referred_id: string
  credits: number
}

// ============================================================================
// Query Builder Types for Type-Safe Database Operations
// ============================================================================

/**
 * Result of a where clause - provides ordering, grouping, limiting, and promise resolution.
 * @template T - The type of records being queried
 */
export interface WhereResult<T> {
  /** Order results by specified columns */
  orderBy: (...columns: unknown[]) => OrderByResult<T>
  /** Group results by specified columns */
  groupBy: (...columns: unknown[]) => GroupByResult<T>
  /** Limit the number of results */
  limit: (n: number) => T[]
  /** Execute query and resolve with results */
  then: <R>(callback: (rows: T[]) => R) => R
}

/**
 * Result of an orderBy clause - provides limiting and promise resolution.
 * @template T - The type of records being queried
 */
export interface OrderByResult<T> {
  /** Limit the number of results */
  limit: (n: number) => T[]
  /** Execute query and resolve with results */
  then: <R>(callback: (rows: T[]) => R) => R
}

/**
 * Result of a groupBy clause - provides ordering.
 * @template T - The type of records being queried
 */
export interface GroupByResult<T> {
  /** Order grouped results */
  orderBy: (...columns: unknown[]) => OrderByResult<T>
}

/**
 * Result of a from clause - provides where, join, and promise resolution.
 * @template T - The type of records being queried
 */
export interface FromResult<T> {
  /** Filter results with a condition */
  where: (condition?: unknown) => WhereResult<T>
  /** Join with another table */
  innerJoin: (...args: unknown[]) => InnerJoinResult<T>
  /** Execute query and resolve with results */
  then: <R>(callback: (rows: T[]) => R) => R
}

/**
 * Result of an innerJoin clause.
 * @template T - The type of records being queried
 */
export interface InnerJoinResult<T> {
  /** Filter joined results */
  where: (condition?: unknown) => Promise<T[]>
}

/**
 * Select query builder for type-safe select operations.
 * @template T - The type of records being selected
 */
export interface SelectQueryBuilder<T = unknown> {
  /** Specify the table to select from */
  from: (table?: unknown) => FromResult<T>
}

/**
 * Insert query builder for type-safe insert operations.
 * @template T - The type of record being inserted
 */
export interface InsertQueryBuilder<T = unknown> {
  /** Specify the values to insert */
  values: (values: T | T[]) => Promise<void>
}

/**
 * Update set result - provides where clause.
 */
export interface UpdateSetResult {
  /** Filter which records to update */
  where: (condition?: unknown) => Promise<void>
}

/**
 * Update query builder for type-safe update operations.
 * @template T - The type of record being updated
 */
export interface UpdateQueryBuilder<T = unknown> {
  /** Specify the values to set */
  set: (values: Partial<T>) => UpdateSetResult
}

/**
 * Parameters for findFirst query.
 * @template T - The type of record columns
 */
export interface FindFirstParams<T = unknown> {
  /** Condition to filter by */
  where?: unknown
  /** Columns to select */
  columns?: Partial<Record<keyof T, boolean>>
}

/**
 * Query interface for a specific table.
 * @template T - The type of records in the table
 */
export interface TableQuery<T> {
  /** Find the first matching record */
  findFirst: (params?: FindFirstParams<T>) => Promise<T | null>
}

// ============================================================================
// Database connection type for DI
// ============================================================================

/**
 * Minimal database connection interface that both `db` and transaction `tx` satisfy.
 * Used for dependency injection in billing functions.
 * 
 * The generic type parameters allow for type-safe queries while still being
 * flexible enough for mocking in tests.
 * 
 * @example
 * ```typescript
 * // Using with real db
 * const db: BillingDbConnection = realDb
 * 
 * // Using with mock in tests
 * const mockDb = createMockDb({ users: [...], creditGrants: [...] })
 * await myFunction({ deps: { db: mockDb } })
 * ```
 */
export type BillingDbConnection = {
  /**
   * Start a select query. Returns a builder for chaining from/where/orderBy/limit.
   * @param fields - Optional fields object to select specific columns
   */
  select: <T = unknown>(fields?: Record<string, unknown>) => SelectQueryBuilder<T>
  
  /**
   * Start an update query. Returns a builder for chaining set/where.
   * @param table - Optional table reference
   */
  update: <T = unknown>(table?: unknown) => UpdateQueryBuilder<T>
  
  /**
   * Start an insert query. Returns a builder for chaining values.
   * @param table - Optional table reference
   */
  insert: <T = unknown>(table?: unknown) => InsertQueryBuilder<T>
  
  /**
   * Direct query access for Drizzle-style queries.
   * Provides findFirst/findMany methods on specific tables.
   */
  query: {
    /** Query the user table */
    user: TableQuery<BillingUser>
    /** Query the creditLedger table */
    creditLedger: TableQuery<CreditGrant>
  }
}

/**
 * Transaction callback type.
 * This matches the signature of drizzle's db.transaction method.
 * 
 * Note: The callback parameter uses `any` because the real Drizzle transaction
 * type (`PgTransaction`) has many additional properties (schema, rollback, etc.)
 * that our minimal `BillingDbConnection` doesn't include. Using `any` allows
 * both the real transaction and mock implementations to work.
 * 
 * In tests, you can pass a mock that satisfies `BillingDbConnection`:
 * @example
 * ```typescript
 * const mockTransaction: BillingTransactionFn = async (callback) => {
 *   const mockDb = createMockDb({ users: [...] })
 *   return callback(mockDb)
 * }
 * ```
 */
export type BillingTransactionFn = <T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (tx: any) => Promise<T>,
) => Promise<T>

// ============================================================================
// Billing function contracts (existing)
// ============================================================================

export type GetUserUsageDataFn = (params: {
  userId: string
  logger: Logger
}) => Promise<{
  usageThisCycle: number
  balance: {
    totalRemaining: number
    totalDebt: number
    netBalance: number
    breakdown: Record<string, number>
  }
  nextQuotaReset: string
  autoTopupTriggered?: boolean
  autoTopupEnabled?: boolean
}>

export type ConsumeCreditsWithFallbackFn = (params: {
  userId: string
  creditsToCharge: number
  repoUrl?: string | null
  context: string // Description of what the credits are for (e.g., 'web search', 'documentation lookup')
  logger: Logger
}) => Promise<ErrorOr<CreditFallbackResult>>

export type CreditFallbackResult = {
  organizationId?: string
  organizationName?: string
  chargedToOrganization: boolean
}

export type GetOrganizationUsageResponseFn = (params: {
  organizationId: string
  userId: string
  logger: Logger
}) => Promise<{
  type: 'usage-response'
  usage: number
  remainingBalance: number
  balanceBreakdown: Record<string, never>
  next_quota_reset: null
}>

// ============================================================================
// Dependency injection types for billing functions
// ============================================================================

/**
 * Dependencies for triggerMonthlyResetAndGrant
 */
export type TriggerMonthlyResetAndGrantDeps = {
  db?: BillingDbConnection
  transaction?: BillingTransactionFn
}

/**
 * Dependencies for calculateUsageAndBalance
 */
export type CalculateUsageAndBalanceDeps = {
  db?: BillingDbConnection
}

/**
 * Dependencies for consumeCredits
 */
export type ConsumeCreditsDepsFn = {
  db?: BillingDbConnection
}

/**
 * Dependencies for organization billing functions
 */
export type OrganizationBillingDeps = {
  db?: BillingDbConnection
}

/**
 * Dependencies for credit delegation functions
 */
export type CreditDelegationDeps = {
  db?: BillingDbConnection
}

/**
 * Dependencies for usage service functions
 */
export type UsageServiceDeps = {
  triggerMonthlyResetAndGrant?: (params: {
    userId: string
    logger: Logger
    deps?: TriggerMonthlyResetAndGrantDeps
  }) => Promise<{ quotaResetDate: Date; autoTopupEnabled: boolean }>
  checkAndTriggerAutoTopup?: (params: {
    userId: string
    logger: Logger
  }) => Promise<number | undefined>
  calculateUsageAndBalance?: (params: {
    userId: string
    quotaResetDate: Date
    now?: Date
    isPersonalContext?: boolean
    logger: Logger
    deps?: CalculateUsageAndBalanceDeps
  }) => Promise<{
    usageThisCycle: number
    balance: {
      totalRemaining: number
      totalDebt: number
      netBalance: number
      breakdown: Record<GrantType, number>
      principals: Record<GrantType, number>
    }
  }>
}
