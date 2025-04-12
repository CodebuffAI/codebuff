import db from '../db'
import * as schema from '../db/schema'
import { and, asc, gt, isNull, or, eq, sql } from 'drizzle-orm'
import { GrantType } from '../db/schema'
import { logger } from '../util/logger'
import { GRANT_PRIORITIES } from '../constants/grant-priorities'

export interface CreditBalance {
  totalRemaining: number
  // Remaining credits per type across all active grants
  breakdown: Partial<Record<GrantType, number>>
}

export interface CreditUsageAndBalance {
  usageThisCycle: number
  balance: CreditBalance
}

/**
 * Calculates both the current balance and usage in this cycle in a single query.
 * This is more efficient than calculating them separately.
 */
export async function calculateUsageAndBalance(
  userId: string,
  quotaResetDate: Date
): Promise<CreditUsageAndBalance> {
  const now = new Date()

  // Get all relevant grants in one query
  const grants = await db
    .select({
      amount: schema.creditGrant.amount,
      amount_remaining: schema.creditGrant.amount_remaining,
      type: schema.creditGrant.type,
      expires_at: schema.creditGrant.expires_at,
      created_at: schema.creditGrant.created_at,
      priority: schema.creditGrant.priority,
    })
    .from(schema.creditGrant)
    .where(
      and(
        eq(schema.creditGrant.user_id, userId),
        or(
          // For balance: active grants (not expired)
          and(
            or(
              isNull(schema.creditGrant.expires_at),
              gt(schema.creditGrant.expires_at, now)
            ),
            gt(schema.creditGrant.amount_remaining, 0)
          ),
          // For usage: grants active in this cycle
          or(
            gt(schema.creditGrant.created_at, quotaResetDate),
            and(
              or(
                isNull(schema.creditGrant.expires_at),
                gt(schema.creditGrant.expires_at, quotaResetDate)
              )
            )
          )
        )
      )
    )
    .orderBy(
      asc(schema.creditGrant.priority),
      asc(schema.creditGrant.created_at)
    )

  // Initialize balance structure
  const balance: CreditBalance = {
    totalRemaining: 0,
    breakdown: {},
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
      usageThisCycle += grant.amount - grant.amount_remaining
    }

    // Add to balance if grant is currently active
    if (
      (!grant.expires_at || grant.expires_at > now) &&
      grant.amount_remaining > 0
    ) {
      balance.totalRemaining += grant.amount_remaining
      balance.breakdown[grantType] =
        (balance.breakdown[grantType] || 0) + grant.amount_remaining
    }
  }

  logger.debug(
    { userId, balance, usageThisCycle, grantsCount: grants.length },
    'Calculated usage and balance'
  )

  return { usageThisCycle, balance }
}

/**
 * Updates the remaining amounts in credit grants after consumption.
 * Follows priority order strictly - higher priority grants (lower number) are consumed first.
 *
 * @param userId The ID of the user
 * @param creditsToConsume Number of credits being consumed
 * @returns Promise resolving when updates are complete
 */
export async function consumeCredits(
  userId: string,
  creditsToConsume: number
): Promise<void> {
  // 1. Get active grants ordered by priority
  const now = new Date()
  const activeGrants = await db
    .select()
    .from(schema.creditGrant)
    .where(
      and(
        eq(schema.creditGrant.user_id, userId),
        or(
          isNull(schema.creditGrant.expires_at),
          gt(schema.creditGrant.expires_at, now)
        ),
        gt(schema.creditGrant.amount_remaining, 0) // Only get grants with remaining credits
      )
    )
    .orderBy(
      asc(schema.creditGrant.priority),
      asc(schema.creditGrant.created_at)
    )

  let remainingToConsume = creditsToConsume

  // 2. Consume from each grant in priority order
  for (const grant of activeGrants) {
    if (remainingToConsume <= 0) break

    const consumeFromThisGrant = Math.min(
      grant.amount_remaining,
      remainingToConsume
    )
    const newRemaining = grant.amount_remaining - consumeFromThisGrant
    remainingToConsume -= consumeFromThisGrant

    // Update this grant's remaining amount
    await db
      .update(schema.creditGrant)
      .set({ amount_remaining: newRemaining })
      .where(eq(schema.creditGrant.operation_id, grant.operation_id))

    logger.debug(
      {
        userId,
        grantId: grant.operation_id,
        grantType: grant.type,
        consumed: consumeFromThisGrant,
        remaining: newRemaining,
      },
      'Updated grant remaining amount after consumption'
    )
  }

  // 3. If we couldn't consume all requested credits, something's wrong
  if (remainingToConsume > 0) {
    logger.error(
      { userId, creditsToConsume, unconsumed: remainingToConsume },
      'Insufficient credits to consume requested amount'
    )
    throw new Error('Insufficient credits')
  }

  logger.info(
    { userId, creditsConsumed: creditsToConsume },
    'Successfully consumed credits'
  )
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
      totalUsed: sql<number>`COALESCE(SUM(${schema.creditGrant.amount} - ${schema.creditGrant.amount_remaining}), 0)`,
    })
    .from(schema.creditGrant)
    .where(
      and(
        eq(schema.creditGrant.user_id, userId),
        // Grant was created during this cycle OR expires after this cycle starts (including never expires)
        or(
          gt(schema.creditGrant.created_at, quotaResetDate),
          and(
            or(
              isNull(schema.creditGrant.expires_at),
              gt(schema.creditGrant.expires_at, quotaResetDate)
            )
          )
        )
      )
    )

  return usageResult[0].totalUsed
}
