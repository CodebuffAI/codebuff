import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { GRANT_PRIORITIES } from '@codebuff/common/constants/grant-priorities'
import {
  DEFAULT_TIER,
  SUBSCRIPTION_DISPLAY_NAME,
  SUBSCRIPTION_TIERS,
} from '@codebuff/common/constants/subscription-plans'

import type { SubscriptionTierPrice } from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { withAdvisoryLockTransaction } from '@codebuff/internal/db/transaction'
import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type Stripe from 'stripe'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionRow = typeof schema.subscription.$inferSelect

export type DbConn = Pick<typeof db, 'select' | 'update' | 'insert'>

export interface SubscriptionLimits {
  creditsPerBlock: number
  blockDurationHours: number
  weeklyCreditsLimit: number
}

export interface WeeklyUsage {
  used: number
  limit: number
  remaining: number
  resetsAt: Date
  percentUsed: number
}

export interface BlockGrant {
  grantId: string
  credits: number
  expiresAt: Date
  isNew: boolean
}

export interface WeeklyLimitError {
  error: 'weekly_limit_reached'
  used: number
  limit: number
  resetsAt: Date
}

export interface BlockExhaustedError {
  error: 'block_exhausted'
  blockUsed: number
  blockLimit: number
  resetsAt: Date
}

export type BlockGrantResult = BlockGrant | WeeklyLimitError | BlockExhaustedError

export function isWeeklyLimitError(
  result: BlockGrantResult,
): result is WeeklyLimitError {
  return 'error' in result && result.error === 'weekly_limit_reached'
}

export function isBlockExhaustedError(
  result: BlockGrantResult,
): result is BlockExhaustedError {
  return 'error' in result && result.error === 'block_exhausted'
}

export interface RateLimitStatus {
  limited: boolean
  reason?: 'block_exhausted' | 'weekly_limit'
  canStartNewBlock: boolean

  blockUsed?: number
  blockLimit?: number
  blockResetsAt?: Date

  weeklyUsed: number
  weeklyLimit: number
  weeklyResetsAt: Date
  weeklyPercentUsed: number
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Get the start of the current billing-aligned week.
 * Weeks start on the same day-of-week as the billing period started.
 */
export function getWeekStart(
  billingPeriodStart: Date,
  now: Date = new Date(),
): Date {
  const billingDayOfWeek = billingPeriodStart.getUTCDay()
  const currentDayOfWeek = now.getUTCDay()
  const daysBack = (currentDayOfWeek - billingDayOfWeek + 7) % 7
  return startOfDay(addDays(now, -daysBack))
}

/**
 * Get the end of the current billing-aligned week (start of next week).
 */
export function getWeekEnd(
  billingPeriodStart: Date,
  now: Date = new Date(),
): Date {
  return addDays(getWeekStart(billingPeriodStart, now), 7)
}

// ---------------------------------------------------------------------------
// Subscription limits
// ---------------------------------------------------------------------------

/**
 * Resolves the effective subscription limits for a user.
 * Checks `limit_override` first, then falls back to the default tier constants.
 */
export async function getSubscriptionLimits(params: {
  userId: string
  logger: Logger
  conn?: DbConn
  tier?: number | null
}): Promise<SubscriptionLimits> {
  const { userId, logger, conn = db, tier } = params

  const overrides = await conn
    .select()
    .from(schema.limitOverride)
    .where(eq(schema.limitOverride.user_id, userId))
    .limit(1)

  if (overrides.length > 0) {
    const o = overrides[0]
    logger.debug(
      { userId, creditsPerBlock: o.credits_per_block },
      'Using limit override for user',
    )
    return {
      creditsPerBlock: o.credits_per_block,
      blockDurationHours: o.block_duration_hours,
      weeklyCreditsLimit: o.weekly_credit_limit,
    }
  }

  const tierConfig =
    tier != null && tier in SUBSCRIPTION_TIERS
      ? SUBSCRIPTION_TIERS[tier as SubscriptionTierPrice]
      : DEFAULT_TIER

  return {
    creditsPerBlock: tierConfig.creditsPerBlock,
    blockDurationHours: tierConfig.blockDurationHours,
    weeklyCreditsLimit: tierConfig.weeklyCreditsLimit,
  }
}

// ---------------------------------------------------------------------------
// Weekly usage tracking
// ---------------------------------------------------------------------------

/**
 * Calculates credits consumed from subscription grants during the current
 * billing-aligned week.
 */
export async function getWeeklyUsage(params: {
  userId: string
  billingPeriodStart: Date
  weeklyCreditsLimit: number
  logger: Logger
  conn?: DbConn
}): Promise<WeeklyUsage> {
  const {
    userId,
    billingPeriodStart,
    weeklyCreditsLimit,
    conn = db,
  } = params

  const now = new Date()
  const weekStart = getWeekStart(billingPeriodStart, now)
  const weekEnd = getWeekEnd(billingPeriodStart, now)

  const result = await conn
    .select({
      total: sql<number>`COALESCE(SUM(${schema.creditLedger.principal} - ${schema.creditLedger.balance}), 0)`,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        eq(schema.creditLedger.type, 'subscription'),
        gte(schema.creditLedger.created_at, weekStart),
        lt(schema.creditLedger.created_at, weekEnd),
      ),
    )

  const used = Number(result[0]?.total ?? 0)

  return {
    used,
    limit: weeklyCreditsLimit,
    remaining: Math.max(0, weeklyCreditsLimit - used),
    resetsAt: weekEnd,
    percentUsed: weeklyCreditsLimit > 0
      ? Math.round((used / weeklyCreditsLimit) * 100)
      : 0,
  }
}

// ---------------------------------------------------------------------------
// Block grant management
// ---------------------------------------------------------------------------

/**
 * Ensures the user has an active subscription block grant.
 *
 * 1. Returns the existing active grant if one exists with balance > 0.
 * 2. Checks the weekly limit — returns an error if reached.
 * 3. Creates a new block grant and returns it.
 *
 * All operations are serialised under an advisory lock for the user.
 */
export async function ensureActiveBlockGrantCallback(params: {
  conn: DbConn
  userId: string
  subscription: SubscriptionRow
  logger: Logger
  now?: Date
}): Promise<BlockGrantResult> {
  const { conn, userId, subscription, logger, now = new Date() } = params
  const subscriptionId = subscription.stripe_subscription_id

  // 1. Check for an existing non-expired block grant (regardless of balance)
  const existingGrants = await conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        eq(schema.creditLedger.type, 'subscription'),
        gt(schema.creditLedger.expires_at, now),
      ),
    )
    .orderBy(desc(schema.creditLedger.expires_at))
    .limit(1)

  if (existingGrants.length > 0) {
    const g = existingGrants[0]
    
    // Block exists with credits remaining - return it
    if (g.balance > 0) {
      return {
        grantId: g.operation_id,
        credits: g.balance,
        expiresAt: g.expires_at!,
        isNew: false,
      } satisfies BlockGrant
    }
    
    // Block exists but is exhausted - don't create a new one until it expires
    return {
      error: 'block_exhausted',
      blockUsed: g.principal,
      blockLimit: g.principal,
      resetsAt: g.expires_at!,
    } satisfies BlockExhaustedError
  }

  // 2. Resolve limits
  const limits = await getSubscriptionLimits({
    userId,
    logger,
    conn,
    tier: subscription.tier,
  })

  // 3. Check weekly limit before creating a new block
  const weekly = await getWeeklyUsage({
    userId,
    billingPeriodStart: subscription.billing_period_start,
    weeklyCreditsLimit: limits.weeklyCreditsLimit,
    logger,
    conn,
  })

  if (weekly.remaining <= 0) {
    trackEvent({
      event: AnalyticsEvent.SUBSCRIPTION_WEEKLY_LIMIT_HIT,
      userId,
      properties: {
        subscriptionId,
        weeklyUsed: weekly.used,
        weeklyLimit: weekly.limit,
      },
      logger,
    })

    return {
      error: 'weekly_limit_reached',
      used: weekly.used,
      limit: weekly.limit,
      resetsAt: weekly.resetsAt,
    } satisfies WeeklyLimitError
  }

  // 4. Create new block grant (capped to weekly remaining)
  const blockCredits = Math.min(limits.creditsPerBlock, weekly.remaining)
  const expiresAt = addHours(now, limits.blockDurationHours)
  const operationId = `block-${subscriptionId}-${now.getTime()}`

  const [newGrant] = await conn
    .insert(schema.creditLedger)
    .values({
      operation_id: operationId,
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      type: 'subscription',
      principal: blockCredits,
      balance: blockCredits,
      priority: GRANT_PRIORITIES.subscription,
      expires_at: expiresAt,
      description: `${SUBSCRIPTION_DISPLAY_NAME} block (${limits.blockDurationHours}h)`,
    })
    .onConflictDoNothing({ target: schema.creditLedger.operation_id })
    .returning()

  if (!newGrant) {
    throw new Error(
      'Failed to create block grant — possible duplicate operation',
    )
  }

  trackEvent({
    event: AnalyticsEvent.SUBSCRIPTION_BLOCK_CREATED,
    userId,
    properties: {
      subscriptionId,
      operationId,
      credits: blockCredits,
      expiresAt: expiresAt.toISOString(),
      weeklyUsed: weekly.used,
      weeklyLimit: weekly.limit,
    },
    logger,
  })

  logger.info(
    {
      userId,
      subscriptionId,
      operationId,
      credits: blockCredits,
      expiresAt,
    },
    'Created new subscription block grant',
  )

  return {
    grantId: newGrant.operation_id,
    credits: blockCredits,
    expiresAt,
    isNew: true,
  } satisfies BlockGrant
}

export async function ensureActiveBlockGrant(params: {
  userId: string
  subscription: SubscriptionRow
  logger: Logger
}): Promise<BlockGrantResult> {
  const { userId, subscription, logger } = params
  const subscriptionId = subscription.stripe_subscription_id

  const { result } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      return ensureActiveBlockGrantCallback({
        conn: tx,
        userId,
        subscription,
        logger,
      })
    },
    lockKey: `user:${userId}`,
    context: { userId, subscriptionId },
    logger,
  })

  return result
}

/**
 * Combined function that gets the active subscription and ensures a block grant exists.
 * Returns the block grant result if the user has an active subscription, null otherwise.
 */
export async function ensureSubscriberBlockGrant(params: {
  userId: string
  logger: Logger
}): Promise<BlockGrantResult | null> {
  const { userId, logger } = params

  const subscription = await getActiveSubscription({ userId, logger })
  if (!subscription) {
    return null
  }

  return ensureActiveBlockGrant({ userId, subscription, logger })
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Checks the subscriber's current rate-limit status.
 *
 * Two layers:
 * - **Block**: 5-hour window with a fixed credit allowance
 * - **Weekly**: billing-aligned weekly cap
 */
export async function checkRateLimit(params: {
  userId: string
  subscription: SubscriptionRow
  logger: Logger
  conn?: DbConn
}): Promise<RateLimitStatus> {
  const { userId, subscription, logger, conn = db } = params
  const now = new Date()

  const limits = await getSubscriptionLimits({
    userId,
    logger,
    conn,
    tier: subscription.tier,
  })

  const weekly = await getWeeklyUsage({
    userId,
    billingPeriodStart: subscription.billing_period_start,
    weeklyCreditsLimit: limits.weeklyCreditsLimit,
    logger,
    conn,
  })

  // Weekly limit takes precedence
  if (weekly.used >= weekly.limit) {
    return {
      limited: true,
      reason: 'weekly_limit',
      canStartNewBlock: false,
      weeklyUsed: weekly.used,
      weeklyLimit: weekly.limit,
      weeklyResetsAt: weekly.resetsAt,
      weeklyPercentUsed: weekly.percentUsed,
    }
  }

  // Find most recent active subscription block grant for this user
  const blocks = await conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        eq(schema.creditLedger.type, 'subscription'),
        gt(schema.creditLedger.expires_at, now),
      ),
    )
    .orderBy(desc(schema.creditLedger.created_at))
    .limit(1)

  const currentBlock = blocks[0]

  // No active block → can start a new one
  if (!currentBlock) {
    return {
      limited: false,
      canStartNewBlock: true,
      weeklyUsed: weekly.used,
      weeklyLimit: weekly.limit,
      weeklyResetsAt: weekly.resetsAt,
      weeklyPercentUsed: weekly.percentUsed,
    }
  }

  // Block active but exhausted
  if (currentBlock.balance <= 0) {
    return {
      limited: true,
      reason: 'block_exhausted',
      canStartNewBlock: false,
      blockUsed: currentBlock.principal,
      blockLimit: currentBlock.principal,
      blockResetsAt: currentBlock.expires_at!,
      weeklyUsed: weekly.used,
      weeklyLimit: weekly.limit,
      weeklyResetsAt: weekly.resetsAt,
      weeklyPercentUsed: weekly.percentUsed,
    }
  }

  // Block active with credits remaining
  return {
    limited: false,
    canStartNewBlock: false,
    blockUsed: currentBlock.principal - currentBlock.balance,
    blockLimit: currentBlock.principal,
    blockResetsAt: currentBlock.expires_at!,
    weeklyUsed: weekly.used,
    weeklyLimit: weekly.limit,
    weeklyResetsAt: weekly.resetsAt,
    weeklyPercentUsed: weekly.percentUsed,
  }
}

// ---------------------------------------------------------------------------
// Block grant expiration
// ---------------------------------------------------------------------------

export async function expireActiveBlockGrants(params: {
  userId: string
  subscriptionId: string
  logger: Logger
  conn?: DbConn
}): Promise<number> {
  const { userId, subscriptionId, logger, conn = db } = params
  const now = new Date()

  const expired = await conn
    .update(schema.creditLedger)
    .set({ expires_at: now })
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        eq(schema.creditLedger.type, 'subscription'),
        gt(schema.creditLedger.expires_at, now),
      ),
    )
    .returning({ operation_id: schema.creditLedger.operation_id })

  if (expired.length > 0) {
    logger.info(
      { userId, subscriptionId, expiredCount: expired.length },
      'Expired active block grants',
    )
  }

  return expired.length
}

// ---------------------------------------------------------------------------
// Subscription lookup
// ---------------------------------------------------------------------------

export async function getActiveSubscription(params: {
  userId: string
  logger: Logger
}): Promise<SubscriptionRow | null> {
  const { userId } = params

  const subs = await db
    .select()
    .from(schema.subscription)
    .where(
      and(
        eq(schema.subscription.user_id, userId),
        eq(schema.subscription.status, 'active'),
      ),
    )
    .orderBy(desc(schema.subscription.updated_at))
    .limit(1)

  return subs[0] ?? null
}

export async function isSubscriber(params: {
  userId: string
  logger: Logger
}): Promise<boolean> {
  const sub = await getActiveSubscription(params)
  return sub !== null
}

// ---------------------------------------------------------------------------
// Subscribe flow
// ---------------------------------------------------------------------------

/**
 * Handles the first-time-subscribe side-effects:
 * 1. Moves `next_quota_reset` to Stripe's `current_period_end`.
 * 2. Migrates unused credits into a single grant aligned to the new reset
 *    date.
 *
 * All operations run inside an advisory-locked transaction.
 */
export async function handleSubscribe(params: {
  userId: string
  stripeSubscription: Stripe.Subscription
  logger: Logger
}): Promise<void> {
  const { userId, stripeSubscription, logger } = params
  const newResetDate = new Date(stripeSubscription.current_period_end * 1000)

  const { result: didMigrate } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      // Idempotency: check if credits were already migrated for this subscription.
      // We use the credit_ledger instead of the subscription table because
      // handleSubscriptionUpdated may upsert the subscription row before
      // invoice.paid fires, which would cause this check to skip migration.
      const migrationOpId = `subscribe-migrate-${stripeSubscription.id}`
      const existingMigration = await tx
        .select({ operation_id: schema.creditLedger.operation_id })
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.operation_id, migrationOpId))
        .limit(1)

      if (existingMigration.length > 0) {
        logger.info(
          { userId, subscriptionId: stripeSubscription.id },
          'Credits already migrated — skipping handleSubscribe',
        )
        return false
      }

      // Move next_quota_reset to align with Stripe billing period
      await tx
        .update(schema.user)
        .set({ next_quota_reset: newResetDate })
        .where(eq(schema.user.id, userId))

      // Migrate unused credits so nothing is lost
      await migrateUnusedCredits({
        tx,
        userId,
        subscriptionId: stripeSubscription.id,
        expiresAt: newResetDate,
        logger,
      })

      return true
    },
    lockKey: `user:${userId}`,
    context: { userId, subscriptionId: stripeSubscription.id },
    logger,
  })

  if (didMigrate) {
    trackEvent({
      event: AnalyticsEvent.SUBSCRIPTION_CREATED,
      userId,
      properties: {
        subscriptionId: stripeSubscription.id,
        newResetDate: newResetDate.toISOString(),
      },
      logger,
    })

    logger.info(
      {
        userId,
        subscriptionId: stripeSubscription.id,
        newResetDate,
      },
      'Processed subscribe: reset date moved and credits migrated',
    )
  }
}

// ---------------------------------------------------------------------------
// Internal: credit migration
// ---------------------------------------------------------------------------

export type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never

/**
 * Migrates unused credits (any type with a non-null expires_at in the future)
 * into a single grant that expires at `expiresAt`. The old grants have their
 * balance zeroed.
 */
export async function migrateUnusedCredits(params: {
  tx: DbTransaction
  userId: string
  subscriptionId: string
  expiresAt: Date
  logger: Logger
}): Promise<void> {
  const { tx, userId, subscriptionId, expiresAt, logger } = params
  const now = new Date()

  const unusedGrants = await tx
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        gt(schema.creditLedger.balance, 0),
        ne(schema.creditLedger.type, 'subscription'),
        isNull(schema.creditLedger.org_id),
        gt(schema.creditLedger.expires_at, now),
        lte(schema.creditLedger.expires_at, expiresAt),
      ),
    )

  const totalUnused = unusedGrants.reduce(
    (sum, grant) => sum + grant.balance,
    0,
  )

  // Deterministic ID ensures idempotency — duplicate webhook deliveries
  // will hit onConflictDoNothing and the handleSubscribe caller checks
  // for this operation_id before running.
  const operationId = `subscribe-migrate-${subscriptionId}`

  if (totalUnused === 0) {
    // Still insert the marker for idempotency so handleSubscribe's check
    // short-circuits on duplicate webhook deliveries.
    await tx
      .insert(schema.creditLedger)
      .values({
        operation_id: operationId,
        user_id: userId,
        type: 'free',
        principal: 0,
        balance: 0,
        priority: GRANT_PRIORITIES.free,
        expires_at: expiresAt,
        description: 'Migrated credits from subscription transition',
      })
      .onConflictDoNothing({ target: schema.creditLedger.operation_id })
    logger.debug({ userId }, 'No unused credits to migrate')
    return
  }

  // Zero out old grants
  for (const grant of unusedGrants) {
    await tx
      .update(schema.creditLedger)
      .set({
        balance: 0,
        description: `Migrated ${grant.balance} credits to ${operationId}`,
      })
      .where(eq(schema.creditLedger.operation_id, grant.operation_id))
  }

  // Create a single migration grant preserving the total
  await tx
    .insert(schema.creditLedger)
    .values({
      operation_id: operationId,
      user_id: userId,
      type: 'free',
      principal: totalUnused,
      balance: totalUnused,
      priority: GRANT_PRIORITIES.free,
      expires_at: expiresAt,
      description: 'Migrated credits from subscription transition',
    })
    .onConflictDoNothing({ target: schema.creditLedger.operation_id })

  trackEvent({
    event: AnalyticsEvent.SUBSCRIPTION_CREDITS_MIGRATED,
    userId,
    properties: {
      totalMigrated: totalUnused,
      grantsZeroed: unusedGrants.length,
      operationId,
    },
    logger,
  })

  logger.info(
    {
      userId,
      totalMigrated: totalUnused,
      grantsZeroed: unusedGrants.length,
      operationId,
    },
    'Migrated unused credits for subscription transition',
  )
}
