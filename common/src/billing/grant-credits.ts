import db from '../db'
import * as schema from '../db/schema'
import { GrantType } from '../db/schema'
import { logger } from '../util/logger'
import { getUserCostPerCredit } from './conversion'
import { GRANT_PRIORITIES } from '../constants/grant-priorities'
import { eq, desc, lte, and, or, sql } from 'drizzle-orm'
import { generateCompactId } from '../util/string'
import { CREDITS_USAGE_LIMITS } from '../constants'

type CreditGrantSelect = typeof schema.creditGrant.$inferSelect

/**
 * Finds the amount of the most recent expired 'free' grant for a user.
 * If no expired 'free' grant is found, returns the default free limit.
 * @param userId The ID of the user.
 * @returns The amount of the last expired free grant or the default.
 */
export async function getPreviousFreeGrantAmount(userId: string): Promise<number> {
  const now = new Date()
  const lastExpiredFreeGrant = await db.query.creditGrant.findFirst({
    where: and(
      eq(schema.creditGrant.user_id, userId),
      eq(schema.creditGrant.type, 'free'),
      lte(schema.creditGrant.expires_at, now) // Grant has expired
    ),
    orderBy: [desc(schema.creditGrant.expires_at)], // Most recent expiry first
    columns: {
      amount: true,
    },
  })

  if (lastExpiredFreeGrant) {
    logger.debug(
      { userId, amount: lastExpiredFreeGrant.amount },
      'Found previous expired free grant amount.'
    )
    return lastExpiredFreeGrant.amount
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
export async function calculateTotalReferralBonus(userId: string): Promise<number> {
  try {
    const result = await db
      .select({
        totalCredits: sql<number>`COALESCE(SUM(${schema.referral.credits}), 0)`,
      })
      .from(schema.referral)
      .where(
        or(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.referred_id, userId)
        )
      )

    const totalBonus = result[0]?.totalCredits ?? 0
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
 * Processes a credit grant request:
 * 1. Validates the user.
 * 2. Creates a local grant record.
 *
 * Grant priorities (lower = higher priority):
 * - free (20): Monthly free credits, consumed first
 * - referral (40): Referral bonus credits
 * - purchase (60): Purchased credits
 * - admin (80): Admin-granted credits
 *
 * @param userId The ID of the user receiving the grant.
 * @param credits The number of credits to grant (must be positive).
 * @param type The type of grant (e.g., 'free', 'referral', 'purchase', 'admin').
 * @param description Optional description for the grant.
 * @param expiresAt Optional expiration date for the grant. Null means never expires.
 * @param operationId A unique identifier for this grant operation (UUID recommended). If not provided, one will be generated.
 * @returns The created local grant record or null if an error occurred.
 */
export async function processAndGrantCredit(
  userId: string,
  credits: number,
  type: GrantType,
  description: string | null = null,
  expiresAt: Date | null = null,
  operationId: string | null = null
): Promise<CreditGrantSelect | null> {
  const opId = operationId || `${type}-${userId}-${generateCompactId()}`
  const logContext = { userId, credits, type, operationId: opId, expiresAt }

  if (credits <= 0) {
    logger.warn(
      logContext,
      'Attempted to grant non-positive credits. Skipping.'
    )
    return null
  }

  // 1. Validate user exists
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { id: true },
  })

  if (!user) {
    logger.error(logContext, 'User not found for credit grant. Skipping.')
    return null
  }

  // 2. Get priority from our centralized GRANT_PRIORITIES
  const priority = GRANT_PRIORITIES[type]
  if (priority === undefined) {
    logger.error(logContext, `Invalid grant type: ${type}. Skipping.`)
    return null
  }

  // 3. Create local grant record
  try {
    const insertedGrants = await db
      .insert(schema.creditGrant)
      .values({
        operation_id: opId,
        user_id: userId,
        amount: credits,
        amount_remaining: credits, // Initially equals the granted amount
        type: type,
        priority: priority,
        description: description,
        expires_at: expiresAt,
      })
      .returning()

    const localGrant = insertedGrants[0]
    if (!localGrant) {
      throw new Error('Failed to insert local credit grant or retrieve it.')
    }
    logger.info(
      logContext,
      `Successfully created local credit grant record ${opId}`
    )
    return localGrant
  } catch (dbError) {
    logger.error(
      { ...logContext, error: dbError },
      'Database error creating local credit grant record.'
    )
    return null
  }
}
