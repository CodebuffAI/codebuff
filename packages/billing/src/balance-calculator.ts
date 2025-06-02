import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, asc, gt, isNull, or, eq, sql } from 'drizzle-orm'
import { GrantType } from 'common/db/schema'
import { logger } from 'common/util/logger'
import { GRANT_PRIORITIES } from 'common/constants/grant-priorities'
import { withSerializableTransaction } from 'common/db/transaction'
import { GrantTypeValues } from 'common/types/grant'

export interface CreditBalance {
  totalRemaining: number
  totalDebt: number
  netBalance: number
  breakdown: Record<GrantType, number>
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
// Exporting DbConn to be used in other files
export type DbConn = Pick<
  typeof db,
  'select' | 'update'
> /* + whatever else you call */

/**
 * Gets active grants for a user, ordered by expiration (soonest first), then priority, and creation date.
 * Added optional `conn` param so callers inside a transaction can supply their TX object.
 */
export async function getOrderedActiveGrants(
  userId: string,
  now: Date,
  conn: DbConn = db, // use DbConn instead of typeof db
  isPersonalContext?: boolean // Added isPersonalContext
) {
  const conditions = [
    eq(schema.creditLedger.user_id, userId),
    or(
      isNull(schema.creditLedger.expires_at),
      gt(schema.creditLedger.expires_at, now)
    ),
  ]

  if (isPersonalContext) {
    conditions.push(isNull(schema.creditLedger.org_id))
  }

  return conn
    .select()
    .from(schema.creditLedger)
    .where(and(...conditions)) // Apply all conditions together)
    .orderBy(
      asc(schema.creditLedger.priority),
      asc(schema.creditLedger.expires_at),
      asc(schema.creditLedger.created_at)
    )
}

/**
 * Gets active grants for an organization, ordered by expiration (soonest first), then priority, and creation date.
 */
export async function getOrderedActiveOrgGrants(
  orgId: string,
  now: Date,
  conn: DbConn = db
) {
  return conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.org_id, orgId), // Filter by org_id
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, now)
        )
      )
    )
    .orderBy(
      asc(schema.creditLedger.priority),
      asc(schema.creditLedger.expires_at),
      asc(schema.creditLedger.created_at)
    )
}

/**
 * Updates a single grant's balance and logs the change.
 * Adapts to handle either userId or orgId for logging context.
 */
async function updateGrantBalance(
  identifier: string, // Can be userId or orgId
  grant: typeof schema.creditLedger.$inferSelect,
  consumed: number,
  newBalance: number,
  tx: DbConn,
  isOrgContext: boolean,
  triggeringUserId?: string // Optional: for org context
) {
  await tx
    .update(schema.creditLedger)
    .set({ balance: newBalance })
    .where(eq(schema.creditLedger.operation_id, grant.operation_id))

  const logContext: any = {
    grantId: grant.operation_id,
    grantType: grant.type,
    consumed,
    remaining: newBalance,
    expiresAt: grant.expires_at,
  }
  if (isOrgContext) {
    logContext.orgId = identifier
    if (triggeringUserId) logContext.triggeringUserId = triggeringUserId
  } else {
    logContext.userId = identifier
  }

  logger.debug(
    logContext,
    'Updated grant remaining amount after consumption'
  )
}

/**
 * Consumes credits from a list of ordered grants.
 * Adapts to handle either userId or orgId.
 */
async function consumeFromOrderedGrants(
  identifier: string, // Can be userId or orgId
  creditsToConsume: number,
  grants: (typeof schema.creditLedger.$inferSelect)[],
  tx: DbConn,
  isOrgContext: boolean,
  triggeringUserId?: string // Optional: for org context
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

      await updateGrantBalance(identifier, grant, -repayAmount, newBalance, tx, isOrgContext, triggeringUserId)

      const logContext: any = { grantId: grant.operation_id, repayAmount, newBalance }
      if (isOrgContext) {
        logContext.orgId = identifier
        if (triggeringUserId) logContext.triggeringUserId = triggeringUserId
      } else {
        logContext.userId = identifier
      }
      logger.debug(logContext, 'Repaid debt in grant')
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
    if (grant.type === 'purchase' || grant.type === 'organization') { // Organization credits are also considered "purchased" in terms of priority/source
      fromPurchased += consumeFromThisGrant
    }

    await updateGrantBalance(
      identifier,
      grant,
      consumeFromThisGrant,
      newBalance,
      tx,
      isOrgContext,
      triggeringUserId
    )
  }

  // If we still have remaining to consume and no grants left, create debt in the last grant
  // For organizations, we might want to prevent debt creation or handle it differently.
  // The plan mentions "Potentially create a debt grant for the organization here if desired, or throw an error."
  // For now, let's mirror the user behavior but log a specific warning for orgs.
  if (remainingToConsume > 0 && grants.length > 0) {
    const lastGrant = grants[grants.length - 1]

    // Only create/increase debt if the last grant is an 'organization' type grant for org context,
    // or any type for user context. This prevents creating debt on e.g. a 'free' grant of an org.
    // However, the current logic for users creates debt on the *last available grant* regardless of its type.
    // To keep it consistent for now, we'll allow debt on the last org grant.
    // A more robust solution might involve a dedicated "debt" grant type for orgs.

    // if (lastGrant.balance <= 0 || (isOrgContext && lastGrant.type === 'organization') || !isOrgContext ) {
    // Simplified: always allow adding to debt on the last grant if it's already zero or negative.
    if (lastGrant.balance <= 0) {
      const newBalance = lastGrant.balance - remainingToConsume
      await updateGrantBalance(
        identifier,
        lastGrant,
        remainingToConsume,
        newBalance,
        tx,
        isOrgContext,
        triggeringUserId
      )
      consumed += remainingToConsume
      
      const logContext: any = {
        grantId: lastGrant.operation_id,
        requested: remainingToConsume,
        consumed: remainingToConsume,
        newDebt: Math.abs(newBalance),
      }
      if (isOrgContext) {
        logContext.orgId = identifier
        if (triggeringUserId) logContext.triggeringUserId = triggeringUserId
        logger.warn(logContext, 'Created new debt in organization grant')
      } else {
        logContext.userId = identifier
        logger.warn(logContext, 'Created new debt in user grant')
      }
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
  now: Date = new Date(),
  conn: DbConn = db, // Add optional conn parameter to pass transaction
  isPersonalContext?: boolean // Added isPersonalContext parameter
): Promise<CreditUsageAndBalance> {
  // Get all relevant grants in one query, using the provided connection
  // Pass isPersonalContext to getOrderedActiveGrants
  const grants = await getOrderedActiveGrants(userId, now, conn, isPersonalContext)

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
      balance.principals[grantType] += grant.principal
      if (grant.balance > 0) {
        totalPositiveBalance += grant.balance
        balance.breakdown[grantType] += grant.balance
      } else if (grant.balance < 0) {
        totalDebt += Math.abs(grant.balance)
      }
    }
  }

  // Perform in-memory settlement if there's both debt and positive balance
  if (totalDebt > 0 && totalPositiveBalance > 0) {
    const settlementAmount = Math.min(totalDebt, totalPositiveBalance)
    logger.debug(
      { userId, totalDebt, totalPositiveBalance, settlementAmount },
      'Performing in-memory settlement'
    )

    // After settlement:
    totalPositiveBalance -= settlementAmount
    totalDebt -= settlementAmount
  }

  // Set final balance values after settlement
  balance.totalRemaining = totalPositiveBalance
  balance.totalDebt = totalDebt
  balance.netBalance = totalPositiveBalance - totalDebt

  logger.debug(
    { userId, balance, usageThisCycle, grantsCount: grants.length },
    'Calculated usage and settled balance'
  )

  return { usageThisCycle, balance }
}

/**
 * Calculates both the current balance and usage in this cycle for an organization.
 */
export async function calculateOrganizationUsageAndBalance(
  orgId: string,
  quotaResetDate: Date, // This is cycleStartDate for orgs
  now: Date = new Date(),
  conn: DbConn = db
): Promise<CreditUsageAndBalance> {
  const grants = await getOrderedActiveOrgGrants(orgId, now, conn)

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

  const balance: CreditBalance = {
    totalRemaining: 0,
    totalDebt: 0,
    netBalance: 0,
    breakdown: initialBreakdown,
    principals: initialPrincipals,
  }

  let usageThisCycle = 0
  let totalPositiveBalance = 0
  let totalDebt = 0

  for (const grant of grants) {
    const grantType = grant.type as GrantType

    if (
      grant.created_at > quotaResetDate ||
      !grant.expires_at ||
      grant.expires_at > quotaResetDate
    ) {
      usageThisCycle += grant.principal - grant.balance
    }

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

  if (totalDebt > 0 && totalPositiveBalance > 0) {
    const settlementAmount = Math.min(totalDebt, totalPositiveBalance)
    logger.debug(
      { orgId, totalDebt, totalPositiveBalance, settlementAmount },
      'Performing in-memory settlement for organization'
    )
    totalPositiveBalance -= settlementAmount
    totalDebt -= settlementAmount
  }

  balance.totalRemaining = totalPositiveBalance
  balance.totalDebt = totalDebt
  balance.netBalance = totalPositiveBalance - totalDebt

  logger.debug(
    { orgId, balance, usageThisCycle, grantsCount: grants.length },
    'Calculated org usage and settled balance'
  )

  return { usageThisCycle, balance }
}

/**
 * Updates the remaining amounts in credit grants after consumption.
 * Follows priority order strictly - higher priority grants (lower number) are consumed first.
 * Returns details about credit consumption including how many came from purchased credits.
 *
 * Uses SERIALIZABLE isolation to prevent concurrent modifications that could lead to
 * incorrect credit usage (e.g., "double spending" credits).
 *
 * @param userId The ID of the user
 * @param creditsToConsume Number of credits being consumed
 * @returns Promise resolving to number of credits consumed
 */
export async function consumeCredits(
  userId: string,
  creditsToConsume: number
): Promise<CreditConsumptionResult> {
  return await withSerializableTransaction(
    async (tx) => {
      const now = new Date()
      const activeGrants = await getOrderedActiveGrants(userId, now, tx)

      if (activeGrants.length === 0) {
        logger.error(
          { userId, creditsToConsume },
          'No active grants found to consume credits from'
        )
        throw new Error('No active grants found')
      }

      const result = await consumeFromOrderedGrants(
        userId,
        creditsToConsume,
        activeGrants,
        tx,
        false, // isOrgContext: false for personal credits
        undefined // triggeringUserId: undefined for personal credits
      )

      return result
    },
    { userId, creditsToConsume }
  )
}

/**
 * Consumes credits from an organization's account.
 *
 * @param orgId The ID of the organization
 * @param creditsToConsume Number of credits being consumed
 * @param triggeringUserId Optional: The ID of the user who triggered this consumption
 * @returns Promise resolving to details about credit consumption
 */
export async function consumeOrganizationCredits(
  orgId: string,
  creditsToConsume: number,
  triggeringUserId?: string // Optional: for logging who caused the consumption
): Promise<CreditConsumptionResult> {
  return await withSerializableTransaction(
    async (tx) => {
      const now = new Date();
      const activeGrants = await getOrderedActiveOrgGrants(orgId, now, tx);

      if (activeGrants.length === 0) {
        logger.error(
          { orgId, creditsToConsume, triggeringUserId },
          'No active organization grants found to consume credits from'
        );
        // As per plan: "Potentially create a debt grant for the organization here if desired,
        // or throw an error. For now, let's assume throwing is appropriate."
        // However, consumeFromOrderedGrants can create debt if a grant exists, even if its balance is 0.
        // If there are truly NO grants (not even one with 0 balance), then we should throw.
        // The current consumeFromOrderedGrants logic will handle creating debt on the last grant if one exists.
        // So, this specific error for "no active grants" means no grant records at all.
        throw new Error(`No active organization grants found for orgId ${orgId} to consume ${creditsToConsume} credits.`);
      }

      const result = await consumeFromOrderedGrants(
        orgId,
        creditsToConsume,
        activeGrants,
        tx,
        true, // isOrgContext
        triggeringUserId
      );
      logger.info({ orgId, consumed: result.consumed, fromPurchased: result.fromPurchased, triggeringUserId }, "Consumed credits from organization account");
      return result;
    },
    { orgId, creditsToConsume, triggeringUserId } // Context for withSerializableTransaction logging
  );
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
