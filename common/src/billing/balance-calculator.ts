import db from '../db'
import * as schema from '../db/schema'
import { and, asc, gt, isNull, or, eq } from 'drizzle-orm'
import { GrantType } from '../db/schema' // Import the derived GrantType'
import { logger } from '../util/logger' // Import logger

// Define Grant Priorities as specified in the plan
export const GRANT_PRIORITIES: Record<GrantType, number> = {
  free: 20,
  referral: 40,
  rollover: 60, // Consumed after free/referral, before purchase
  purchase: 80,
  admin: 100,
}

export interface CreditBalance {
  totalRemaining: number
  // Remaining credits per type across all active grants
  breakdown: Partial<Record<GrantType, number>>
  // Potentially add next_expiry_date if needed for UI later
}

/**
 * Calculates the user's current real-time credit balance based on active grants
 * and current cycle usage.
 * @param userId The ID of the user.
 * @returns A Promise resolving to the user's CreditBalance.
 */
export async function calculateCurrentBalance(
  userId: string
): Promise<CreditBalance> {
  // 1. Fetch the user's current monthly usage
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { usage: true },
  })

  const currentCycleUsage = user?.usage ?? 0

  // 2. Fetch all *currently active* grants for the user
  // Active means expires_at is NULL OR expires_at is in the future
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
        )
      )
    )
    // 3. Order grants by priority ASC, then created_at ASC
    .orderBy(
      asc(schema.creditGrants.priority),
      asc(schema.creditGrants.created_at)
    )

  // 4. Initialize remaining balance structure
  const remainingBalance: CreditBalance = {
    totalRemaining: 0,
    breakdown: {},
  }

  // 5. Initialize usage to account for
  let usageToAccountFor = currentCycleUsage

  // 6. Simulate Consumption through ordered *active* grants
  for (const grant of activeGrants) {
    // How much usage can be covered by this grant?
    const consumedFromThisGrant = Math.min(grant.amount, usageToAccountFor)

    // How much is left in this grant *after* covering the usage?
    const remainingInThisGrant = grant.amount - consumedFromThisGrant

    // Reduce the usage we still need to account for
    usageToAccountFor -= consumedFromThisGrant

    // If there's anything left in this grant, add it to the balance
    if (remainingInThisGrant > 0) {
      remainingBalance.totalRemaining += remainingInThisGrant
      remainingBalance.breakdown[grant.type] =
        (remainingBalance.breakdown[grant.type] || 0) + remainingInThisGrant
    }

    // If we've accounted for all usage, we can stop processing grants
    if (usageToAccountFor <= 0) {
      // Add the remaining amounts of any subsequent grants directly to the balance
      // as they haven't been touched by the current cycle's usage yet.
      const remainingGrants = activeGrants.slice(
        activeGrants.indexOf(grant) + 1
      )
      for (const remainingGrant of remainingGrants) {
        remainingBalance.totalRemaining += remainingGrant.amount
        remainingBalance.breakdown[remainingGrant.type] =
          (remainingBalance.breakdown[remainingGrant.type] || 0) +
          remainingGrant.amount
      }
      break // Exit the main loop
    }
  }

  // 7. Return the calculated balance
  return remainingBalance
}
