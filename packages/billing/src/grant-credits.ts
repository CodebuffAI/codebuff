import { trackEvent } from 'common/analytics'
import { DEFAULT_FREE_CREDITS_GRANT } from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { GRANT_PRIORITIES } from 'common/constants/grant-priorities'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { GrantType } from 'common/db/schema' // Removed CreditLedgerEntry
import { getNextQuotaReset } from 'common/util/dates'
import { logger } from 'common/util/logger'
import { withRetry } from 'common/util/promise'
import { logSyncFailure } from 'common/util/sync-failure'
import { and, desc, eq, gt, isNull, lte, or, sql, SQL } from 'drizzle-orm' // Added SQL
import { withSerializableTransaction } from 'common/db/transaction' // Removed DrizzleTransactionScope
import { calculateOrganizationUsageAndBalance, CreditUsageAndBalance, DbConn } from './balance-calculator' // Import necessary types and DbConn

import { generateOperationIdTimestamp } from './utils'

type CreditGrantSelect = typeof schema.creditLedger.$inferSelect
type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T
) => any
  ? T
  : never

/**
 * Finds the amount of the most recent expired 'free' grant for a user.
 * Finds the amount of the most recent expired 'free' grant for a user,
 * excluding migration grants (operation_id starting with 'migration-').
 * If there is a previous grant, caps the amount at 2000 credits.
 * If no expired 'free' grant is found, returns the default free limit.
 * @param userId The ID of the user.
 * @returns The amount of the last expired free grant (capped at 2000) or the default.
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
    // TODO: remove this once it's past May 22nd, after all users have been migrated over
    const cappedAmount = Math.min(lastExpiredFreeGrant[0].principal, 2000)
    logger.debug(
      { userId, amount: lastExpiredFreeGrant[0].principal },
      'Found previous expired free grant amount.'
    )
    return cappedAmount
  } else {
    logger.debug(
      { userId, defaultAmount: DEFAULT_FREE_CREDITS_GRANT },
      'No previous expired free grant found. Using default.'
    )
    return DEFAULT_FREE_CREDITS_GRANT // Default if no previous grant found
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
 * Core grant operation that can be part of a larger transaction.
 */
export async function grantCreditOperation(
  userId: string, // This is the identifier for logging and debt checking (could be orgId or userId)
  amount: number,
  type: GrantType,
  description: string, // Added description parameter
  priority: number, // Changed from string to number
  operationId: string,
  expiresAt: Date | null,
  userIdForGrant: string, // This is the actual user_id to be stored in creditLedger.user_id
  orgId: string | null, // This is the actual org_id to be stored in creditLedger.org_id
  tx?: DbTransaction
) {
  const dbClient = tx || db;

  const now = new Date();

  // First check for any negative balances associated with the entity (userId or orgId)
  // For orgs, debt is on org-specific grants. For users, on user-specific grants.
  const debtCheckIdentifier = orgId || userId; // Check debt against the org if orgId is present, else user.
  const debtGrantCondition = orgId
    ? eq(schema.creditLedger.org_id, orgId)
    : eq(schema.creditLedger.user_id, userId);

  const negativeGrants = await dbClient
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        debtGrantCondition, // Check against the correct entity
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, now)
        )
      )
    )
    .then((grants) => grants.filter((g) => g.balance < 0));

  if (negativeGrants.length > 0) {
    const totalDebt = negativeGrants.reduce(
      (sum, g) => sum + Math.abs(g.balance),
      0
    );
    for (const grant of negativeGrants) {
      await dbClient
        .update(schema.creditLedger)
        .set({ balance: 0 })
        .where(eq(schema.creditLedger.operation_id, grant.operation_id));
    }
    const remainingAmount = Math.max(0, amount - totalDebt);
    if (remainingAmount > 0) {
      try {
        await dbClient.insert(schema.creditLedger).values({
          operation_id: operationId,
          user_id: userIdForGrant,
          principal: amount, // Store the original amount before debt clearance
          balance: remainingAmount,
          type,
          description:
            totalDebt > 0
              ? `${description} (${totalDebt} credits used to clear existing debt)`
              : description,
          priority: priority, // Use the passed priority (now a number)
          expires_at: expiresAt,
          created_at: now,
          org_id: orgId,
        });
      } catch (error: any) {
        // Check if this is a unique constraint violation on operation_id
        if (
          error.code === '23505' &&
          error.constraint === 'credit_ledger_pkey'
        ) {
          logger.info(
            { userId, orgId, operationId, type, amount },
            'Skipping duplicate credit grant due to idempotency check'
          )
          return // Exit successfully, another concurrent request already created this grant
        }
        throw error // Re-throw any other error
      }
    }
  } else {
    // No debt - create grant normally
    try {
      await dbClient.insert(schema.creditLedger).values({
        operation_id: operationId,
        user_id: userIdForGrant,
        principal: amount,
        balance: amount,
        type,
        description, // Use the passed description
        priority: priority, // Use the passed priority (now a number)
        expires_at: expiresAt,
        created_at: now,
        org_id: orgId,
      });
    } catch (error: any) {
      // Check if this is a unique constraint violation on operation_id
      if (error.code === '23505' && error.constraint === 'credit_ledger_pkey') {
        logger.info(
          { userId, orgId, operationId, type, amount },
          'Skipping duplicate credit grant due to idempotency check'
        )
        return // Exit successfully, another concurrent request already created this grant
      }
      throw error // Re-throw any other error
    }
  }

  trackEvent(AnalyticsEvent.CREDIT_GRANT, userIdForGrant || orgId || 'unknown', { // Ensure a valid subject for trackEvent
    operationId,
    type,
    description, // Use the passed description
    amount,
    expiresAt,
    orgId,
  });

  logger.info(
    { userId: userIdForGrant, orgId, operationId, type, amount, expiresAt, description }, // Added description to log
    'Created new credit grant'
  );
}

/**
 * Processes a credit grant request with retries and failure logging.
 * Used for standalone credit grants that need retry logic and failure tracking.
 */
export async function processAndGrantCredit(
  userId: string,
  amount: number,
  type: GrantType,
  description: string,
  expiresAt: Date | null,
  operationId: string,
  orgId?: string
): Promise<void> {
  try {
    await withRetry(
      () =>
        grantCreditOperation(
          orgId || userId, // Identifier for debt checking
          amount,
          type,
          description, // Pass description
          GRANT_PRIORITIES[type], // This should be a number
          operationId,
          expiresAt,
          userId,    // Actual user_id for the grant record
          orgId || null, // Actual org_id for the grant record
          undefined // tx
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
    );
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

/**
 * Grants credits to an organization.
 * This function will create a new credit ledger entry for the organization.
 * After granting, it recalculates and returns the organization's new balance state.
 *
 * @param orgId The ID of the organization.
 * @param amount The amount of credits to grant.
 * @param operationId Optional custom operation ID.
 * @param expiresAt Optional expiration date for the grant.
 * @param userIdForGrant Optional user ID to associate with this grant (e.g., admin who granted).
 * @returns Promise resolving to the organization's new CreditUsageAndBalance.
 */
export async function grantOrganizationCredits(
  orgId: string,
  amount: number,
  operationId: string = `org_grant-${generateOperationIdTimestamp(new Date())}`, // Corrected default operationId generation
  expiresAt: Date | null = null,
  userIdForGrant?: string, // This is the user ID to be stored in credit_ledger.user_id
): Promise<CreditUsageAndBalance> {
  return await withSerializableTransaction(async (tx: DbTransaction) => { // Used DbTransaction type
    await grantCreditOperation(
      orgId, // Identifier for debt checking and logging context
      amount,
      'organization',
      'Organization credit grant', // Default description
      GRANT_PRIORITIES.organization, // This should be a number
      operationId,
      expiresAt,
      userIdForGrant || orgId, // If no specific user, associate with orgId (or handle as needed)
      orgId, // The org_id for the grant record
      tx
    );

    const now = new Date();
    // Corrected the where clause and property access for billing_cycle_start_date
    const organization = await tx.query.org.findFirst({ 
      where: eq(schema.org.id, orgId) 
    });
    // Use current_period_start as per schema, then created_at as fallback
    const cycleStartDate = organization?.current_period_start ?? organization?.created_at ?? new Date(0); 

    return calculateOrganizationUsageAndBalance(orgId, cycleStartDate, now, tx as unknown as DbConn);
  }, { orgId, amount });
}

/**
 * Checks if a user's quota needs to be reset, and if so:
 * 1. Calculates their new monthly grant amount
 * 2. Issues the grant with the appropriate expiry
 * 3. Updates their next_quota_reset date
 * All of this is done in a single transaction to ensure consistency.
 *
 * @param userId The ID of the user
 * @returns The effective quota reset date (either existing or new)
 */
export async function triggerMonthlyResetAndGrant(
  userId: string
): Promise<Date> {
  return await db.transaction(async (tx) => {
    const now = new Date()

    // Get user's current reset date
    const user = await tx.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        next_quota_reset: true,
      },
    })

    if (!user) {
      throw new Error(`User ${userId} not found`)
    }

    const currentResetDate = user.next_quota_reset

    // If reset date is in the future, no action needed
    if (currentResetDate && currentResetDate > now) {
      return currentResetDate
    }

    // Calculate new reset date
    const newResetDate = getNextQuotaReset(currentResetDate)

    // Calculate grant amounts separately
    const [freeGrantAmount, referralBonus] = await Promise.all([
      getPreviousFreeGrantAmount(userId),
      calculateTotalReferralBonus(userId),
    ])

    // Generate a deterministic operation ID based on userId and reset date to minute precision
    const timestamp = generateOperationIdTimestamp(newResetDate)
    const freeOperationId = `free-${userId}-${timestamp}`
    const referralOperationId = `referral-${userId}-${timestamp}`

    // Update the user's next reset date
    await tx
      .update(schema.user)
      .set({ next_quota_reset: newResetDate })
      .where(eq(schema.user.id, userId))

    // Always grant free credits
    await processAndGrantCredit(
      userId,
      freeGrantAmount,
      'free',
      'Monthly free credits',
      newResetDate, // Free credits expire at next reset
      freeOperationId
    )

    // Only grant referral credits if there are any
    if (referralBonus > 0) {
      await processAndGrantCredit(
        userId,
        referralBonus,
        'referral',
        'Monthly referral bonus',
        newResetDate, // Referral credits expire at next reset
        referralOperationId
      )
    }

    logger.info(
      {
        userId,
        freeOperationId,
        referralOperationId,
        freeGrantAmount,
        referralBonus,
        newResetDate,
        previousResetDate: currentResetDate,
      },
      'Processed monthly credit grants and reset'
    )

    return newResetDate
  })
}
