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
// Database connection type for DI
// ============================================================================

/**
 * Minimal database connection interface that both `db` and transaction `tx` satisfy.
 * Used for dependency injection in billing functions.
 */
export type BillingDbConnection = {
  select: (...args: any[]) => any
  update: (...args: any[]) => any
  insert: (...args: any[]) => any
  query: {
    user: {
      findFirst: (params: any) => Promise<any>
    }
    creditLedger: {
      findFirst: (params: any) => Promise<any>
    }
  }
}

/**
 * Transaction callback type.
 * This matches the signature of drizzle's db.transaction method.
 */
export type BillingTransactionFn = <T>(
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
