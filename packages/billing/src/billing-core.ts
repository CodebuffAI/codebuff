import { GrantTypeValues } from '@codebuff/common/types/grant'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, asc, eq, gt, isNull, or } from 'drizzle-orm'

import type { GrantType } from '@codebuff/internal/db/schema'

/**
 * Represents the credit balance state for a user or organization.
 *
 * Note on breakdown vs totalRemaining:
 * - `breakdown` shows actual per-grant-type balances from the database (pre-settlement)
 * - `totalRemaining` is the post-settlement effective balance
 * - After debt settlement, sum(breakdown) may not equal totalRemaining
 * - This is intentional: breakdown reflects database state, totalRemaining reflects effective balance
 */
export interface CreditBalance {
  /** Post-settlement remaining balance (effective available credits) */
  totalRemaining: number
  /** Post-settlement remaining debt */
  totalDebt: number
  /** Net balance after settlement (totalRemaining - totalDebt) */
  netBalance: number
  /** Pre-settlement balance breakdown by grant type (reflects actual database values) */
  breakdown: Record<GrantType, number>
  /** Principal amounts by grant type */
  principals: Record<GrantType, number>
}

export interface CreditUsageAndBalance {
  usageThisCycle: number
  balance: CreditBalance
}

export interface CreditConsumptionResult {
  consumed: number
  fromPurchased: number
}

// Add a minimal structural type that both `db` and `tx` satisfy
export type DbConn = Pick<typeof db, 'select' | 'update'>

export type BalanceSettlement = {
  totalDebt: number
  totalPositiveBalance: number
  settlementAmount: number
}

export type BalanceCalculationResult = CreditUsageAndBalance & {
  settlement?: BalanceSettlement
}

export const GRANT_ORDER_BY = [
  asc(schema.creditLedger.priority),
  asc(schema.creditLedger.expires_at),
  asc(schema.creditLedger.created_at),
] as const

type CreditGrant = Pick<
  typeof schema.creditLedger.$inferSelect,
  'type' | 'principal' | 'balance' | 'created_at' | 'expires_at'
>

/**
 * Gets ordered grants for a user or organization.
 *
 * @param includeExpiredSince - When provided, includes grants that expired after this date
 *   (even if expired before `now`). Use this for usage calculations where you need to
 *   count usage from grants that expired mid-cycle. For credit consumption, omit this
 *   to only get currently active grants.
 */
export async function getOrderedActiveGrantsForOwner(params: {
  ownerId: string
  ownerType: 'user' | 'organization'
  now: Date
  conn?: DbConn
  includeExpiredSince?: Date
}) {
  const { ownerId, ownerType, now, conn = db, includeExpiredSince } = params
  const ownerColumn =
    ownerType === 'user'
      ? schema.creditLedger.user_id
      : schema.creditLedger.org_id

  const expirationThreshold = includeExpiredSince ?? now

  return conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(ownerColumn, ownerId),
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, expirationThreshold),
        ),
      ),
    )
    .orderBy(...GRANT_ORDER_BY)
}

export function calculateUsageAndBalanceFromGrants(params: {
  grants: CreditGrant[]
  quotaResetDate: Date
  now: Date
  isPersonalContext?: boolean
}): BalanceCalculationResult {
  const { grants, quotaResetDate, now, isPersonalContext = false } = params

  // Initialize breakdown and principals with all grant types set to 0
  const initialBreakdown: Record<GrantType, number> = {} as Record<
    GrantType,
    number
  >
  const initialPrincipals: Record<GrantType, number> = {} as Record<
    GrantType,
    number
  >

  for (const type of GrantTypeValues) {
    initialBreakdown[type] = 0
    initialPrincipals[type] = 0
  }

  // Initialize balance structure
  const balance: CreditBalance = {
    totalRemaining: 0,
    totalDebt: 0,
    netBalance: 0,
    breakdown: initialBreakdown,
    principals: initialPrincipals,
  }

  // Calculate both metrics in one pass
  let usageThisCycle = 0
  let totalPositiveBalance = 0
  let totalDebt = 0

  // First pass: calculate initial totals and usage
  for (const grant of grants) {
    const grantType = grant.type as GrantType

    // Skip organization credits for personal context
    if (isPersonalContext && grantType === 'organization') {
      continue
    }

    if (
      grant.created_at > quotaResetDate ||
      !grant.expires_at ||
      grant.expires_at > quotaResetDate
    ) {
      usageThisCycle += grant.principal - grant.balance
    }

    // Add to balance if grant is currently active
    if (!grant.expires_at || grant.expires_at > now) {
      balance.principals[grantType] += grant.principal
      if (grant.balance > 0) {
        totalPositiveBalance += grant.balance
        balance.breakdown[grantType] += grant.balance
      } else if (grant.balance < 0) {
        totalDebt += Math.abs(grant.balance)
      }
    }
  }

  let settlement: BalanceSettlement | undefined
  if (totalDebt > 0 && totalPositiveBalance > 0) {
    const settlementAmount = Math.min(totalDebt, totalPositiveBalance)
    settlement = { totalDebt, totalPositiveBalance, settlementAmount }

    // After settlement:
    totalPositiveBalance -= settlementAmount
    totalDebt -= settlementAmount
  }

  balance.totalRemaining = totalPositiveBalance
  balance.totalDebt = totalDebt
  balance.netBalance = totalPositiveBalance - totalDebt

  return { usageThisCycle, balance, settlement }
}
