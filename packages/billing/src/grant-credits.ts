import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { GRANT_PRIORITIES } from '@codebuff/common/constants/grant-priorities'
import { DEFAULT_FREE_CREDITS_GRANT } from '@codebuff/common/old-constants'
import { getNextQuotaReset } from '@codebuff/common/util/dates'
import { withRetry } from '@codebuff/common/util/promise'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { withAdvisoryLockTransaction } from '@codebuff/internal/db/transaction'
import { logSyncFailure } from '@codebuff/internal/util/sync-failure'
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'

import { generateOperationIdTimestamp } from './utils'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { GrantType } from '@codebuff/internal/db/schema'

type _CreditGrantSelect = typeof schema.creditLedger.$inferSelect
type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
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
export async function getPreviousFreeGrantAmount(params: {
  userId: string
  logger: Logger
}): Promise<number> {
  const { userId, logger } = params

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
        lte(schema.creditLedger.expires_at, now), // Grant has expired
      ),
    )
    .orderBy(desc(schema.creditLedger.expires_at)) // Most recent expiry first
    .limit(1)

  if (lastExpiredFreeGrant.length > 0) {
    // TODO: remove this once it's past May 22nd, after all users have been migrated over
    const cappedAmount = Math.min(lastExpiredFreeGrant[0].principal, 2000)
    logger.debug(
      { userId, amount: lastExpiredFreeGrant[0].principal },
      'Found previous expired free grant amount.',
    )
    return cappedAmount
  } else {
    logger.debug(
      { userId, defaultAmount: DEFAULT_FREE_CREDITS_GRANT },
      'No previous expired free grant found. Using default.',
    )
    return DEFAULT_FREE_CREDITS_GRANT // Default if no previous grant found
  }
}

/**
 * Calculates the total legacy referral bonus credits a user should receive based on
 * their legacy referral history (both as referrer and referred).
 * Only counts referrals where is_legacy = true (grandfathered users from old program).
 * @param userId The ID of the user.
 * @returns The total legacy referral bonus credits earned.
 */
export async function calculateTotalLegacyReferralBonus(params: {
  userId: string
  logger: Logger
}): Promise<number> {
  const { userId, logger } = params

  try {
    const result = await db
      .select({
        totalCredits: sql<string>`COALESCE(SUM(${schema.referral.credits}), 0)`,
      })
      .from(schema.referral)
      .where(
        and(
          or(
            eq(schema.referral.referrer_id, userId),
            eq(schema.referral.referred_id, userId),
          ),
          eq(schema.referral.is_legacy, true),
        ),
      )

    const totalBonus = parseInt(result[0]?.totalCredits ?? '0')
    logger.debug({ userId, totalBonus }, 'Calculated total legacy referral bonus.')
    return totalBonus
  } catch (error) {
    logger.error(
      { userId, error },
      'Error calculating total legacy referral bonus. Returning 0.',
    )
    return 0
  }
}

/**
 * Core grant operation that performs the actual credit grant logic.
 * This should be called within a transaction that holds the appropriate advisory lock.
 * Uses ON CONFLICT DO NOTHING for idempotency - duplicate grants are silently ignored.
 */
async function executeGrantCreditOperation(params: {
  userId: string
  amount: number
  type: GrantType
  description: string
  expiresAt: Date | null
  operationId: string
  tx: DbTransaction
  logger: Logger
}) {
  const {
    userId,
    amount,
    type,
    description,
    expiresAt,
    operationId,
    tx,
    logger,
  } = params

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
          gt(schema.creditLedger.expires_at, now),
        ),
      ),
    )
    .then((grants) => grants.filter((g) => g.balance < 0))

  let inserted = false
  let fullyConsumedByDebt = false

  if (negativeGrants.length > 0) {
    const totalDebt = negativeGrants.reduce(
      (sum, g) => sum + Math.abs(g.balance),
      0,
    )
    for (const grant of negativeGrants) {
      await tx
        .update(schema.creditLedger)
        .set({ balance: 0 })
        .where(eq(schema.creditLedger.operation_id, grant.operation_id))
    }
    const remainingAmount = Math.max(0, amount - totalDebt)
    if (remainingAmount > 0) {
      // Use onConflictDoNothing for idempotency - duplicate operation_ids are silently ignored
      const result = await tx
        .insert(schema.creditLedger)
        .values({
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
        .onConflictDoNothing({ target: schema.creditLedger.operation_id })
        .returning({ id: schema.creditLedger.operation_id })
      inserted = result.length > 0
    } else {
      // All credits consumed by debt - this is success, not a duplicate
      fullyConsumedByDebt = true
      logger.info(
        { userId, operationId, type, amount, debtCleared: totalDebt },
        'Credit grant fully applied to existing debt',
      )
    }
  } else {
    // No debt - create grant normally
    // Use onConflictDoNothing for idempotency - duplicate operation_ids are silently ignored
    const result = await tx
      .insert(schema.creditLedger)
      .values({
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
      .onConflictDoNothing({ target: schema.creditLedger.operation_id })
      .returning({ id: schema.creditLedger.operation_id })
    inserted = result.length > 0
  }

  // Only log and track analytics if we actually inserted a new grant
  if (inserted) {
    trackEvent({
      event: AnalyticsEvent.CREDIT_GRANT,
      userId,
      properties: {
        operationId,
        type,
        description,
        amount,
        expiresAt,
      },
      logger,
    })

    logger.info(
      { userId, operationId, type, amount, expiresAt },
      'Created new credit grant',
    )
  } else if (!fullyConsumedByDebt) {
    // Only log as duplicate if we didn't already log as fully consumed by debt
    logger.debug(
      { userId, operationId, type, amount },
      'Skipping duplicate credit grant due to idempotency check',
    )
  }
}

/**
 * Core grant operation that can be part of a larger transaction.
 * When called with a transaction (tx), assumes the caller holds the advisory lock.
 * When called without a transaction, acquires the advisory lock automatically.
 */
export async function grantCreditOperation(params: {
  userId: string
  amount: number
  type: GrantType
  description: string
  expiresAt: Date | null
  operationId: string
  tx?: DbTransaction
  logger: Logger
}) {
  const { userId, tx, logger } = params

  // If a transaction is provided, the caller is responsible for locking
  // (e.g., triggerMonthlyResetAndGrant which does multiple grants in one tx)
  if (tx) {
    await executeGrantCreditOperation({ ...params, tx })
    return
  }

  // Otherwise, wrap in advisory lock to serialize with other credit operations for this user
  await withAdvisoryLockTransaction({
    callback: async (tx) => {
      await executeGrantCreditOperation({ ...params, tx })
    },
    lockKey: `user:${userId}`,
    context: { userId, operationId: params.operationId, type: params.type },
    logger,
  }).then(({ result }) => result)
}

/**
 * Processes a credit grant request with retries and failure logging.
 * Used for standalone credit grants that need retry logic and failure tracking.
 */
export async function processAndGrantCredit(params: {
  userId: string
  amount: number
  type: GrantType
  description: string
  expiresAt: Date | null
  operationId: string
  logger: Logger
}): Promise<void> {
  const { operationId, logger } = params

  try {
    await withRetry(() => grantCreditOperation(params), {
      maxRetries: 3,
      retryIf: () => true,
      onRetry: (error, attempt) => {
        logger.warn(
          { operationId, attempt, error },
          `processAndGrantCredit retry ${attempt}`,
        )
      },
    })
  } catch (error: any) {
    await logSyncFailure({
      id: operationId,
      errorMessage: error.message,
      provider: 'internal',
      logger,
    })
    logger.error(
      { operationId, error },
      'processAndGrantCredit failed after retries, logged to sync_failure',
    )
    throw error
  }
}

/**
 * Revokes credits from a specific grant by operation ID.
 * This sets the balance to 0 and updates the description to indicate a refund.
 *
 * Uses advisory lock to serialize with other credit operations for the user.
 *
 * @param operationId The operation ID of the grant to revoke
 * @param reason The reason for revoking the credits (e.g. refund)
 * @returns true if the grant was found and revoked, false otherwise
 */
export async function revokeGrantByOperationId(params: {
  operationId: string
  reason: string
  logger: Logger
}): Promise<boolean> {
  const { operationId, reason, logger } = params

  // First, look up the grant to get the user_id for the advisory lock
  const grant = await db.query.creditLedger.findFirst({
    where: eq(schema.creditLedger.operation_id, operationId),
  })

  if (!grant) {
    logger.warn({ operationId }, 'Attempted to revoke non-existent grant')
    return false
  }

  // Determine lock key based on whether this is a user or org grant
  const lockKey = grant.org_id
    ? `org:${grant.org_id}`
    : `user:${grant.user_id}`

  const { result } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      // Re-fetch within transaction to get current state
      const currentGrant = await tx.query.creditLedger.findFirst({
        where: eq(schema.creditLedger.operation_id, operationId),
      })

      if (!currentGrant) {
        logger.warn(
          { operationId },
          'Grant no longer exists after acquiring lock',
        )
        return false
      }

      if (currentGrant.balance < 0) {
        logger.warn(
          { operationId, currentBalance: currentGrant.balance },
          'Cannot revoke grant with negative balance - user has already spent these credits',
        )
        return false
      }

      await tx
        .update(schema.creditLedger)
        .set({
          principal: 0,
          balance: 0,
          description: `${currentGrant.description} (Revoked: ${reason})`,
        })
        .where(eq(schema.creditLedger.operation_id, operationId))

      logger.info(
        {
          operationId,
          userId: currentGrant.user_id,
          orgId: currentGrant.org_id,
          revokedAmount: currentGrant.balance,
          reason,
        },
        'Revoked credit grant',
      )

      return true
    },
    lockKey,
    context: { operationId, userId: grant.user_id, orgId: grant.org_id },
    logger,
  })

  return result
}

/**
 * Checks if a user's quota needs to be reset, and if so:
 * 1. Calculates their new monthly grant amount
 * 2. Issues the grant with the appropriate expiry
 * 3. Updates their next_quota_reset date
 * All of this is done in a single transaction with advisory lock to ensure consistency.
 *
 * @param userId The ID of the user
 * @returns The effective quota reset date (either existing or new)
 */
export interface MonthlyResetResult {
  quotaResetDate: Date
  autoTopupEnabled: boolean
}

export async function triggerMonthlyResetAndGrant(params: {
  userId: string
  logger: Logger
}): Promise<MonthlyResetResult> {
  const { userId, logger } = params

  const { result } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      const now = new Date()

      // Get user's current reset date and auto top-up status
      const user = await tx.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: {
          next_quota_reset: true,
          auto_topup_enabled: true,
        },
      })

      if (!user) {
        throw new Error(`User ${userId} not found`)
      }

      const autoTopupEnabled = user.auto_topup_enabled ?? false
      const currentResetDate = user.next_quota_reset

      // If reset date is in the future, no action needed
      if (currentResetDate && currentResetDate > now) {
        return { quotaResetDate: currentResetDate, autoTopupEnabled }
      }

      // Calculate new reset date
      const newResetDate = getNextQuotaReset(currentResetDate)

      // Calculate grant amounts separately
      const [freeGrantAmount, referralBonus] = await Promise.all([
        getPreviousFreeGrantAmount(params),
        calculateTotalLegacyReferralBonus(params),
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

      // Always grant free credits - use executeGrantCreditOperation with tx since we already hold the lock
      await executeGrantCreditOperation({
        ...params,
        amount: freeGrantAmount,
        type: 'free',
        description: 'Monthly free credits',
        expiresAt: newResetDate, // Free credits expire at next reset
        operationId: freeOperationId,
        tx,
      })

      // Only grant legacy referral credits if there are any (for grandfathered users)
      if (referralBonus > 0) {
        await executeGrantCreditOperation({
          ...params,
          amount: referralBonus,
          type: 'referral_legacy',
          description: 'Monthly referral bonus (legacy)',
          expiresAt: newResetDate, // Legacy referral credits expire at next reset
          operationId: referralOperationId,
          tx,
        })
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
        'Processed monthly credit grants and reset',
      )

      return { quotaResetDate: newResetDate, autoTopupEnabled }
    },
    lockKey: `user:${userId}`,
    context: { userId },
    logger,
  })

  return result
}
