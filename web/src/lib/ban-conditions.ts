import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// =============================================================================
// CONFIGURATION - Edit these values to adjust ban thresholds
// =============================================================================

/** Number of disputes within the time window that triggers a ban */
export const DISPUTE_THRESHOLD = 5

/** Time window in days to count disputes */
export const DISPUTE_WINDOW_DAYS = 14

// =============================================================================
// TYPES
// =============================================================================

export interface BanConditionResult {
  shouldBan: boolean
  reason: string
}

export interface BanConditionContext {
  userId: string
  stripeCustomerId: string
  logger: Logger
}

type BanCondition = (
  context: BanConditionContext,
) => Promise<BanConditionResult>

// =============================================================================
// BAN CONDITIONS
// Add new condition functions here and register them in BAN_CONDITIONS array
// =============================================================================

/**
 * Check if user has too many disputes in the configured time window
 */
async function disputeThresholdCondition(
  context: BanConditionContext,
): Promise<BanConditionResult> {
  const { stripeCustomerId, logger } = context

  const windowStart = Math.floor(
    (Date.now() - DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
  )

  const disputes = await stripeServer.disputes.list({
    limit: 100,
    created: { gte: windowStart },
    expand: ['data.charge'],
  })

  // Filter to only this customer's disputes
  const customerDisputes = disputes.data.filter((dispute) => {
    const chargeCustomer = (dispute.charge as any)?.customer
    if (typeof chargeCustomer === 'string') {
      return chargeCustomer === stripeCustomerId
    }
    return chargeCustomer?.id === stripeCustomerId
  })

  const disputeCount = customerDisputes.length

  logger.debug(
    { stripeCustomerId, disputeCount, threshold: DISPUTE_THRESHOLD },
    'Checked dispute threshold condition',
  )

  if (disputeCount >= DISPUTE_THRESHOLD) {
    return {
      shouldBan: true,
      reason: `${disputeCount} disputes in past ${DISPUTE_WINDOW_DAYS} days (threshold: ${DISPUTE_THRESHOLD})`,
    }
  }

  return {
    shouldBan: false,
    reason: '',
  }
}

// =============================================================================
// CONDITION REGISTRY
// Add new conditions to this array to enable them
// =============================================================================

const BAN_CONDITIONS: BanCondition[] = [
  disputeThresholdCondition,
  // Add future conditions here, e.g.:
  // ipRangeCondition,
  // usageAnomalyCondition,
]

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Look up a user by their Stripe customer ID
 */
export async function getUserByStripeCustomerId(
  stripeCustomerId: string,
): Promise<{
  id: string
  banned: boolean
  email: string
  name: string | null
} | null> {
  const users = await db
    .select({
      id: schema.user.id,
      banned: schema.user.banned,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.user)
    .where(eq(schema.user.stripe_customer_id, stripeCustomerId))
    .limit(1)

  return users[0] ?? null
}

/**
 * Ban a user and log the action
 */
export async function banUser(
  userId: string,
  reason: string,
  logger: Logger,
): Promise<void> {
  await db
    .update(schema.user)
    .set({ banned: true })
    .where(eq(schema.user.id, userId))

  logger.info({ userId, reason }, 'User banned')
}

/**
 * Evaluate all ban conditions for a user
 * Returns as soon as any condition triggers a ban
 */
export async function evaluateBanConditions(
  context: BanConditionContext,
): Promise<BanConditionResult> {
  for (const condition of BAN_CONDITIONS) {
    const result = await condition(context)
    if (result.shouldBan) {
      return result
    }
  }

  return {
    shouldBan: false,
    reason: '',
  }
}
