import db from '../db'
import * as schema from '../db/schema'
import { GrantType } from '../db/schema'
import { logger } from '../util/logger'
import { getUserCostPerCredit } from './conversion'
import { GRANT_PRIORITIES } from '../constants/grant-priorities'
import { eq } from 'drizzle-orm'
import { generateCompactId } from '../util/string'

type CreditGrantSelect = typeof schema.creditGrants.$inferSelect

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
      .insert(schema.creditGrants)
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
