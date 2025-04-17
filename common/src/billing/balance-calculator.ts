import db from '../db'
import * as schema from '../db/schema'
import { and, asc, gt, isNull, or, eq, sql } from 'drizzle-orm'
import { GrantType } from '../db/schema'
import { logger } from '../util/logger'
import { GRANT_PRIORITIES } from '../constants/grant-priorities'

export interface CreditBalance {
  totalRemaining: number
  totalDebt: number
  netBalance: number
  breakdown: Partial<Record<GrantType, number>>
  principals: Partial<Record<GrantType, number>>
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
type DbConn = Pick<typeof db, 'select' | 'update'> /* + whatever else you call */

/**
 * Gets active grants for a user, ordered by expiration (soonest first), then priority, and creation date.
 * Added optional `conn` param so callers inside a transaction can supply their TX object.
 */
export async function getOrderedActiveGrants(
  userId: string,
  now: Date,
  conn: DbConn = db  // use DbConn instead of typeof db
) {
  return conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, now)
        )
      )
    )
    .orderBy(
      // Use grants based on priority, then expiration date, then creation date
      asc(schema.creditLedger.priority),
      asc(schema.creditLedger.expires_at),
      asc(schema.creditLedger.created_at)
    )
}

/**
 * Updates a single grant's balance and logs the change.
 */
async function updateGrantBalance(
  userId: string,
  grant: typeof schema.creditLedger.$inferSelect,
  consumed: number,
  newBalance: number,
  tx: DbConn
) {
  await tx
    .update(schema.creditLedger)
    .set({ balance: newBalance })
    .where(eq(schema.creditLedger.operation_id, grant.operation_id))

  logger.debug(
    {
      userId,
      grantId: grant.operation_id,
      grantType: grant.type,
      consumed,
      remaining: newBalance,
      expiresAt: grant.expires_at,
    },
    'Updated grant remaining amount after consumption'
  )
}

/**
 * Consumes credits from a list of ordered grants.
 */
async function consumeFromOrderedGrants(
  userId: string,
  creditsToConsume: number,
  grants: (typeof schema.creditLedger.$inferSelect)[],
  tx: DbConn
): Promise<CreditConsumptionResult> {
  let remainingToConsume = creditsToConsume
  let consumed = 0
  let fromPurchased = 0

  // First pass: try to repay any debt
  for (const grant of grants) {
    if (grant.balance < 0 && remainingToConsume > 0) {
      const debtAmount = Math.abs(grant.balance)
      const repayAmount = Math.min(debtAmount, remainingToConsume)
      const newBalance = grant.balance + repayAmount
      remainingToConsume -= repayAmount
      consumed += repayAmount

      await updateGrantBalance(userId, grant, -repayAmount, newBalance, tx)

      logger.debug(
        { userId, grantId: grant.operation_id, repayAmount, newBalance },
        'Repaid debt in grant'
      )
    }
  }

  // Second pass: consume from positive balances
  for (const grant of grants) {
    if (remainingToConsume <= 0) break
    if (grant.balance <= 0) continue

    const consumeFromThisGrant = Math.min(remainingToConsume, grant.balance)
    const newBalance = grant.balance - consumeFromThisGrant
    remainingToConsume -= consumeFromThisGrant
    consumed += consumeFromThisGrant

    // Track consumption from purchased credits
    if (grant.type === 'purchase') {
      fromPurchased += consumeFromThisGrant
    }

    await updateGrantBalance(userId, grant, consumeFromThisGrant, newBalance, tx)
  }

  // If we still have remaining to consume and no grants left, create debt in the last grant
  if (remainingToConsume > 0 && grants.length > 0) {
    const lastGrant = grants[grants.length - 1]

    if (lastGrant.balance <= 0) {
      const newBalance = lastGrant.balance - remainingToConsume
      await updateGrantBalance(
        userId,
        lastGrant,
        remainingToConsume,
        newBalance,
        tx
      )
      consumed += remainingToConsume

      logger.warn(
        {
          userId,
          grantId: lastGrant.operation_id,
          requested: remainingToConsume,
          consumed: remainingToConsume,
          newDebt: Math.abs(newBalance),
        },
        'Created new debt in grant'
      )
    }
  }

  return { consumed, fromPurchased }
}

/**
 * Calculates both the current balance and usage in this cycle in a single query.
 * This is more efficient than calculating them separately.
 */
export async function calculateUsageAndBalance(
  userId: string,
  quotaResetDate: Date,
  now: Date = new Date()
): Promise<CreditUsageAndBalance> {
  // Get all relevant grants in one query
  const grants = await getOrderedActiveGrants(userId, now)

  // Initialize balance structure
  const balance: CreditBalance = {
    totalRemaining: 0,
    totalDebt: 0,
    netBalance: 0,
    breakdown: {},
    principals: {},
  }

  // Calculate both metrics in one pass
  let usageThisCycle = 0
  for (const grant of grants) {
    const grantType = grant.type as GrantType

    // Calculate usage if grant was active in this cycle
    if (
      grant.created_at > quotaResetDate ||
      !grant.expires_at ||
      grant.expires_at > quotaResetDate
    ) {
      usageThisCycle += grant.principal - grant.balance
    }

    // Add to balance if grant is currently active
    if (!grant.expires_at || grant.expires_at > now) {
      if (grant.balance > 0) {
        balance.totalRemaining += grant.balance
        balance.breakdown[grantType] =
          (balance.breakdown[grantType] || 0) + grant.balance
        balance.principals[grantType] =
          (balance.principals[grantType] || 0) + grant.principal
      } else if (grant.balance < 0) {
        balance.totalDebt += Math.abs(grant.balance)
      }
    }
  }

  // Calculate net balance
  balance.netBalance = balance.totalRemaining - balance.totalDebt

  logger.debug(
    { userId, balance, usageThisCycle, grantsCount: grants.length },
    'Calculated usage and balance'
  )

  return { usageThisCycle, balance }
}

/**
 * Updates the remaining amounts in credit grants after consumption.
 * Follows priority order strictly - higher priority grants (lower number) are consumed first.
 * Returns details about credit consumption including how many came from purchased credits.
 *
 * @param userId The ID of the user
 * @param creditsToConsume Number of credits being consumed
 * @returns Promise resolving to number of credits consumed
 * @throws Error if user has any debt
 */
export async function consumeCredits(
  userId: string,
  creditsToConsume: number
): Promise<CreditConsumptionResult> {
  return await db.transaction(async (tx) => {
    const now = new Date()
    const activeGrants = await getOrderedActiveGrants(userId, now, tx as DbConn)

    if (activeGrants.length === 0) {
      logger.error(
        { userId, creditsToConsume },
        'No active grants found to consume credits from'
      )
      throw new Error('No active grants found')
    }

    const hasDebt = activeGrants.some((grant) => grant.balance < 0)
    if (hasDebt) {
      logger.error(
        { userId, creditsToConsume },
        'Cannot consume credits - user has existing debt'
      )
      throw new Error(
        'Cannot use credits while you have unpaid debt. Please add credits to clear your debt first.'
      )
    }

    const result = await consumeFromOrderedGrants(
      userId,
      creditsToConsume,
      activeGrants,
      tx
    )
    logger.info(
      {
        userId,
        creditsRequested: creditsToConsume,
        creditsConsumed: result.consumed,
        fromPurchased: result.fromPurchased,
      },
      'Successfully consumed credits'
    )

    return result
  })
}

/**
 * Calculate the total credits used during the current billing cycle for a user
 * by summing the difference between initial and remaining amounts for all relevant grants.
 */
export async function calculateUsageThisCycle(
  userId: string,
  quotaResetDate: Date
): Promise<number> {
  const usageResult = await db
    .select({
      totalUsed: sql<number>`COALESCE(SUM(${schema.creditLedger.principal} - ${schema.creditLedger.balance}), 0)`,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        // Grant was created during this cycle OR expires after this cycle starts (including never expires)
        or(
          gt(schema.creditLedger.created_at, quotaResetDate),
          and(
            or(
              isNull(schema.creditLedger.expires_at),
              gt(schema.creditLedger.expires_at, quotaResetDate)
            )
          )
        )
      )
    )

  return usageResult[0].totalUsed
}
