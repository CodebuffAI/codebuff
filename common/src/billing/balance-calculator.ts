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

/**
 * Calculates the user's current real-time credit balance based on active grants.
 * Grants are consumed in priority order (lower number = higher priority).
 *
 * @param userId The ID of the user
 * @returns A Promise resolving to the user's CreditBalance
 */
export async function calculateCurrentBalance(
  userId: string
): Promise<CreditBalance> {
  // 1. Fetch all currently active grants for the user
  // Active means expires_at is NULL OR expires_at is in the future AND has remaining credits
  const now = new Date()
  const activeGrants = await db
    .select()
    .from(schema.creditGrants)
    .where(
      and(
        eq(schema.creditGrants.user_id, userId),
        or(
          isNull(schema.creditGrants.expires_at),
          gt(schema.creditGrants.expires_at, now)
        ),
        gt(schema.creditGrants.amount_remaining, 0) // Only get grants with remaining credits
      )
    )
    // Order grants by priority ASC (consume higher priority/lower number first)
    .orderBy(
      asc(schema.creditGrants.priority),
      asc(schema.creditGrants.created_at)
    )

  // 2. Initialize balance structure
  const balance: CreditBalance = {
    totalRemaining: 0,
    breakdown: {},
  }

  // 3. Sum up remaining amounts by type
  for (const grant of activeGrants) {
    balance.totalRemaining += grant.amount_remaining
    const grantType = grant.type as GrantType
    balance.breakdown[grantType] =
      (balance.breakdown[grantType] || 0) + grant.amount_remaining
  }

  logger.debug(
    { userId, balance, grantsCount: activeGrants.length },
    'Calculated current balance'
  )

  return balance
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
    .from(schema.creditGrants)
    .where(
      and(
        eq(schema.creditGrants.user_id, userId),
        or(
          isNull(schema.creditGrants.expires_at),
          gt(schema.creditGrants.expires_at, now)
        ),
        gt(schema.creditGrants.amount_remaining, 0) // Only get grants with remaining credits
      )
    )
    .orderBy(
      asc(schema.creditGrants.priority),
      asc(schema.creditGrants.created_at)
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
      .update(schema.creditGrants)
      .set({ amount_remaining: newRemaining })
      .where(eq(schema.creditGrants.operation_id, grant.operation_id))

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

  // 4. Update user's usage counter
  await db
    .update(schema.user)
    .set({
      usage: sql`${schema.user.usage} + ${creditsToConsume}`,
    })
    .where(eq(schema.user.id, userId))

  logger.info(
    { userId, creditsConsumed: creditsToConsume },
    'Successfully consumed credits'
  )
}
