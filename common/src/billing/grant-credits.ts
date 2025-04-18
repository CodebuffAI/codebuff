import db from '../db'
import * as schema from '../db/schema'
import { GrantType } from '../db/schema'
import { logger } from '../util/logger'
import { getUserCostPerCredit } from './conversion'
import { GRANT_PRIORITIES } from '../constants/grant-priorities'
import { eq, desc, lte, and, or, sql, isNull, gt } from 'drizzle-orm'
import { generateCompactId } from '../util/string'
import { CREDITS_USAGE_LIMITS } from '../constants'
import { withRetry } from '../util/promise'
import { logSyncFailure } from '../util/sync-failure'

type CreditGrantSelect = typeof schema.creditLedger.$inferSelect

/**
 * Finds the amount of the most recent expired 'free' grant for a user.
 * If no expired 'free' grant is found, returns the default free limit.
 * @param userId The ID of the user.
 * @returns The amount of the last expired free grant or the default.
 */
export async function getPreviousFreeGrantAmount(
  userId: string
): Promise<number> {
  const now = new Date()
  const lastExpiredFreeGrant = await db
    .select({
      principal: schema.creditLedger.principal,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        eq(schema.creditLedger.type, 'free'),
        lte(schema.creditLedger.expires_at, now) // Grant has expired
      )
    )
    .orderBy(desc(schema.creditLedger.expires_at)) // Most recent expiry first
    .limit(1)

  if (lastExpiredFreeGrant.length > 0) {
    logger.debug(
      { userId, amount: lastExpiredFreeGrant[0].principal },
      'Found previous expired free grant amount.'
    )
    return lastExpiredFreeGrant[0].principal
  } else {
    logger.debug(
      { userId, defaultAmount: CREDITS_USAGE_LIMITS.FREE },
      'No previous expired free grant found. Using default.'
    )
    return CREDITS_USAGE_LIMITS.FREE // Default if no previous grant found
  }
}

/**
 * Calculates the total referral bonus credits a user should receive based on
 * their referral history (both as referrer and referred).
 * @param userId The ID of the user.
 * @returns The total referral bonus credits earned.
 */
export async function calculateTotalReferralBonus(
  userId: string
): Promise<number> {
  try {
    const result = await db
      .select({
        totalCredits: sql<string>`COALESCE(SUM(${schema.referral.credits}), 0)`,
      })
      .from(schema.referral)
      .where(
        or(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.referred_id, userId)
        )
      )

    const totalBonus = parseInt(result[0]?.totalCredits ?? '0')
    logger.debug({ userId, totalBonus }, 'Calculated total referral bonus.')
    return totalBonus
  } catch (error) {
    logger.error(
      { userId, error },
      'Error calculating total referral bonus. Returning 0.'
    )
    return 0
  }
}

/**
 * Core grant operation wrapped in a single DB transaction.
 */
async function grantCreditOperation(
  userId: string,
  amount: number,
  type: GrantType,
  description: string,
  expiresAt: Date | null,
  operationId: string
) {
  await db.transaction(async (tx) => {
    const now = new Date()

    // First check for any negative balances
    const negativeGrants = await tx
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
      .then((grants) => grants.filter((g) => g.balance < 0))

    if (negativeGrants.length > 0) {
      const totalDebt = negativeGrants.reduce(
        (sum, g) => sum + Math.abs(g.balance),
        0
      )
      for (const grant of negativeGrants) {
        await tx
          .update(schema.creditLedger)
          .set({ balance: 0 })
          .where(eq(schema.creditLedger.operation_id, grant.operation_id))
      }
      const remainingAmount = Math.max(0, amount - totalDebt)
      if (remainingAmount > 0) {
        await tx.insert(schema.creditLedger).values({
          operation_id: operationId,
          user_id: userId,
          principal: amount,
          balance: remainingAmount,
          type,
          description:
            totalDebt > 0
              ? `${description} (${totalDebt} credits used to clear existing debt)`
              : description,
          priority: GRANT_PRIORITIES[type],
          expires_at: expiresAt,
          created_at: now,
        })
      }
    } else {
      // No debt - create grant normally
      await tx.insert(schema.creditLedger).values({
        operation_id: operationId,
        user_id: userId,
        principal: amount,
        balance: amount,
        type,
        description,
        priority: GRANT_PRIORITIES[type],
        expires_at: expiresAt,
        created_at: now,
      })
    }

    logger.info(
      { userId, operationId, type, amount, expiresAt },
      'Created new credit grant'
    )
  })
}

/**
 * Processes a credit grant request with retries and failure logging.
 */
export async function processAndGrantCredit(
  userId: string,
  amount: number,
  type: GrantType,
  description: string,
  expiresAt: Date | null,
  operationId: string
): Promise<void> {
  try {
    await withRetry(
      () =>
        grantCreditOperation(
          userId,
          amount,
          type,
          description,
          expiresAt,
          operationId
        ),
      {
        maxRetries: 3,
        retryIf: () => true,
        onRetry: (error, attempt) => {
          logger.warn(
            { operationId, attempt, error },
            `processAndGrantCredit retry ${attempt}`
          )
        },
      }
    )
  } catch (error: any) {
    await logSyncFailure(operationId, error.message, 'internal')
    logger.error(
      { operationId, error },
      'processAndGrantCredit failed after retries, logged to sync_failure'
    )
    throw error
  }
}

/**
 * Revokes credits from a specific grant by operation ID.
 * This sets the balance to 0 and updates the description to indicate a refund.
 *
 * @param operationId The operation ID of the grant to revoke
 * @param reason The reason for revoking the credits (e.g. refund)
 * @returns true if the grant was found and revoked, false otherwise
 */
export async function revokeGrantByOperationId(
  operationId: string,
  reason: string
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const grant = await tx.query.creditLedger.findFirst({
      where: eq(schema.creditLedger.operation_id, operationId),
    })

    if (!grant) {
      logger.warn({ operationId }, 'Attempted to revoke non-existent grant')
      return false
    }

    if (grant.balance < 0) {
      logger.warn(
        { operationId, currentBalance: grant.balance },
        'Cannot revoke grant with negative balance - user has already spent these credits'
      )
      return false
    }

    await tx
      .update(schema.creditLedger)
      .set({
        principal: 0,
        balance: 0,
        description: `${grant.description} (Revoked: ${reason})`,
      })
      .where(eq(schema.creditLedger.operation_id, operationId))

    logger.info(
      {
        operationId,
        userId: grant.user_id,
        revokedAmount: grant.balance,
        reason,
      },
      'Revoked credit grant'
    )

    return true
  })
}
