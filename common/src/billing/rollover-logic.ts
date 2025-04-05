import db from '../db'
import * as schema from '../db/schema'
import { and, asc, gt, isNull, or, eq, lte, sql } from 'drizzle-orm'
import { GRANT_PRIORITIES } from './balance-calculator'
import { logger } from '../util/logger'
import { getNextQuotaReset } from '../util/dates' // Assuming this utility exists/is created
import { GrantType } from '../db/schema' // Import the derived GrantType'

// Define which grant types contribute to rollover
const ROLLOVER_GRANT_TYPES: GrantType[] = ['purchase', 'rollover']

/**
 * Calculates the rollover amount for a user at the end of their billing cycle
 * and applies the necessary database updates (creates rollover grant, resets usage, updates reset date).
 *
 * NOTE: This function performs database writes and should be called within a transaction
 * if invoked alongside other database operations. It also depends on the `credit_grants`
 * table and the modified `user` table schema being in place.
 *
 * @param userId The ID of the user whose cycle is ending.
 * @param cycleEndDate The exact date and time the billing cycle ended.
 * @returns A Promise resolving when the process is complete.
 */
export async function calculateAndApplyRollover(
  userId: string,
  cycleEndDate: Date
): Promise<void> {
  logger.info(
    { userId, cycleEndDate },
    'Starting end-of-cycle rollover process'
  )

  try {
    // 1. Fetch the user's usage for the cycle that just ended
    // We need the user record to get the usage *before* resetting it.
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { usage: true, next_quota_reset: true }, // Also get current reset date
    })

    if (!user) {
      logger.error({ userId }, 'User not found during rollover calculation.')
      return
    }

    // Ensure we don't run rollover multiple times for the same cycle
    if (user.next_quota_reset && user.next_quota_reset > cycleEndDate) {
      logger.warn(
        { userId, cycleEndDate, nextReset: user.next_quota_reset },
        'Rollover attempted for a cycle that has not yet ended or already processed. Skipping.'
      )
      return
    }

    const endedCycleUsage = user.usage

    // Calculate the start date of the ended cycle (approximate)
    const cycleStartDate = new Date(cycleEndDate)
    cycleStartDate.setMonth(cycleStartDate.getMonth() - 1) // Approximation

    // 2. Fetch all grants that were active *during* the ended cycle
    // Active during cycle: created_at < cycleEndDate AND (expires_at IS NULL OR expires_at > cycleStartDate)
    const grantsActiveDuringCycle = await db
      .select()
      .from(schema.creditGrants)
      .where(
        and(
          eq(schema.creditGrants.user_id, userId),
          lte(schema.creditGrants.created_at, cycleEndDate), // Created before or exactly at cycle end
          or(
            isNull(schema.creditGrants.expires_at), // Never expires
            gt(schema.creditGrants.expires_at, cycleStartDate) // Expired after cycle start
          )
        )
      )
      // 3. Order grants by priority ASC, then created_at ASC
      .orderBy(
        asc(schema.creditGrants.priority),
        asc(schema.creditGrants.created_at)
      )

    // 4. Initialize rollover amount
    let rolloverAmount = 0

    // 5. Initialize usage to account for from the ended cycle
    let usageToAccountFor = endedCycleUsage

    logger.debug(
      { userId, endedCycleUsage, grantsCount: grantsActiveDuringCycle.length },
      'Simulating consumption for ended cycle'
    )

    // 6. Simulate Cycle Consumption
    for (const grant of grantsActiveDuringCycle) {
      const consumedFromThisGrant = Math.min(grant.amount, usageToAccountFor)
      const remainingInThisGrant = grant.amount - consumedFromThisGrant
      usageToAccountFor -= consumedFromThisGrant

      logger.trace(
        {
          userId,
          grantId: grant.operation_id,
          grantType: grant.type,
          grantAmount: grant.amount,
          consumed: consumedFromThisGrant,
          remainingInGrant: remainingInThisGrant,
          usageLeftToAccount: usageToAccountFor,
        },
        'Processing grant during rollover simulation'
      )

      // 7. Check for Rollover Contribution
      if (
        remainingInThisGrant > 0 &&
        ROLLOVER_GRANT_TYPES.includes(grant.type)
      ) {
        rolloverAmount += remainingInThisGrant
        logger.trace(
          {
            userId,
            grantId: grant.operation_id,
            addedToRollover: remainingInThisGrant,
            newTotalRollover: rolloverAmount,
          },
          'Grant contributed to rollover amount'
        )
      }

      if (usageToAccountFor <= 0) {
        // If usage is covered, check remaining grants for rollover contributions
        const remainingGrants = grantsActiveDuringCycle.slice(
          grantsActiveDuringCycle.indexOf(grant) + 1
        )
        for (const remainingGrant of remainingGrants) {
          if (ROLLOVER_GRANT_TYPES.includes(remainingGrant.type)) {
            rolloverAmount += remainingGrant.amount
            logger.trace(
              {
                userId,
                grantId: remainingGrant.operation_id,
                addedToRollover: remainingGrant.amount,
                newTotalRollover: rolloverAmount,
              },
              'Untouched grant contributed to rollover amount'
            )
          }
        }
        break // All usage accounted for
      }
    }

    logger.info(
      { userId, endedCycleUsage, calculatedRollover: rolloverAmount },
      'Rollover calculation complete'
    )

    // 8. Database Updates (Perform as a transaction)
    await db.transaction(async (tx) => {
      // Insert new 'rollover' grant if amount > 0
      if (rolloverAmount > 0) {
        const rolloverGrantId = `rollover-${userId}-${cycleEndDate.toISOString()}`
        await tx
          .insert(schema.creditGrants)
          .values({
            operation_id: rolloverGrantId,
            user_id: userId,
            amount: rolloverAmount,
            type: 'rollover', // Use string literal directly
            priority: GRANT_PRIORITIES.rollover, // Use defined priority
            expires_at: null, // Rollover credits don't expire
            description: `Rollover from cycle ending ${cycleEndDate.toLocaleDateString()}`,
            // stripe_grant_id is NULL for local grants
          })
          .onConflictDoNothing() // Avoid duplicate rollovers if run concurrently
        logger.debug({ userId, rolloverAmount }, 'Inserted rollover grant')
      } else {
        logger.debug({ userId }, 'No rollover amount to grant.')
      }

      // Update the user: reset usage and set next reset date
      const nextResetDate = getNextQuotaReset(cycleEndDate) // Calculate the next reset date based on the cycle end
      await tx
        .update(schema.user)
        .set({
          usage: 0,
          next_quota_reset: nextResetDate,
        })
        .where(eq(schema.user.id, userId))

      logger.info(
        { userId, nextResetDate: nextResetDate.toISOString() },
        'User usage reset and next reset date updated'
      )
    })

    logger.info({ userId }, 'Rollover process completed successfully.')
  } catch (error) {
    logger.error(
      { userId, cycleEndDate, error },
      'Error during rollover process'
    )
    // Depending on trigger mechanism, might need error handling/retry logic here
    throw error // Re-throw to indicate failure if called from a job
  }
}
