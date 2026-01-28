import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { GRANT_PRIORITIES } from '@codebuff/common/constants/grant-priorities'
import {
  DEFAULT_TIER,
  SUBSCRIPTION_DISPLAY_NAME,
} from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { withAdvisoryLockTransaction } from '@codebuff/internal/db/transaction'
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type Stripe from 'stripe'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionRow = typeof schema.subscription.$inferSelect

type DbConn = Pick<typeof db, 'select' | 'update' | 'insert'>

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

export type BlockGrantResult = BlockGrant | WeeklyLimitError

export function isWeeklyLimitError(
  result: BlockGrantResult,
): result is WeeklyLimitError {
  return 'error' in result
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
}): Promise<SubscriptionLimits> {
  const { userId, logger, conn = db } = params

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

  return {
    creditsPerBlock: DEFAULT_TIER.creditsPerBlock,
    blockDurationHours: DEFAULT_TIER.blockDurationHours,
    weeklyCreditsLimit: DEFAULT_TIER.weeklyCreditsLimit,
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
  stripeSubscriptionId: string
  billingPeriodStart: Date
  weeklyCreditsLimit: number
  logger: Logger
  conn?: DbConn
}): Promise<WeeklyUsage> {
  const {
    stripeSubscriptionId,
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
        eq(
          schema.creditLedger.stripe_subscription_id,
          stripeSubscriptionId,
        ),
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
export async function ensureActiveBlockGrant(params: {
  userId: string
  subscription: SubscriptionRow
  logger: Logger
}): Promise<BlockGrantResult> {
  const { userId, subscription, logger } = params
  const subscriptionId = subscription.stripe_subscription_id

  const { result } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      const now = new Date()

      // 1. Check for an existing active block grant
      const existingGrants = await tx
        .select()
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.user_id, userId),
            eq(schema.creditLedger.type, 'subscription'),
            eq(schema.creditLedger.stripe_subscription_id, subscriptionId),
            gt(schema.creditLedger.expires_at, now),
            gt(schema.creditLedger.balance, 0),
          ),
        )
        .orderBy(desc(schema.creditLedger.expires_at))
        .limit(1)

      if (existingGrants.length > 0) {
        const g = existingGrants[0]
        return {
          grantId: g.operation_id,
          credits: g.balance,
          expiresAt: g.expires_at!,
          isNew: false,
        } satisfies BlockGrant
      }

      // 2. Resolve limits
      const limits = await getSubscriptionLimits({
        userId,
        logger,
        conn: tx,
      })

      // 3. Check weekly limit before creating a new block
      const weekly = await getWeeklyUsage({
        stripeSubscriptionId: subscriptionId,
        billingPeriodStart: subscription.billing_period_start,
        weeklyCreditsLimit: limits.weeklyCreditsLimit,
        logger,
        conn: tx,
      })

      if (weekly.used >= weekly.limit) {
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

      // 4. Create new block grant
      const expiresAt = addHours(now, limits.blockDurationHours)
      const operationId = `block-${subscriptionId}-${now.getTime()}`

      const [newGrant] = await tx
        .insert(schema.creditLedger)
        .values({
          operation_id: operationId,
          user_id: userId,
          stripe_subscription_id: subscriptionId,
          type: 'subscription',
          principal: limits.creditsPerBlock,
          balance: limits.creditsPerBlock,
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
          credits: limits.creditsPerBlock,
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
          credits: limits.creditsPerBlock,
          expiresAt,
        },
        'Created new subscription block grant',
      )

      return {
        grantId: newGrant.operation_id,
        credits: limits.creditsPerBlock,
        expiresAt,
        isNew: true,
      } satisfies BlockGrant
    },
    lockKey: `user:${userId}`,
    context: { userId, subscriptionId },
    logger,
  })

  return result
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
}): Promise<RateLimitStatus> {
  const { userId, subscription, logger } = params
  const subscriptionId = subscription.stripe_subscription_id
  const now = new Date()

  const limits = await getSubscriptionLimits({
    userId,
    logger,
  })

  const weekly = await getWeeklyUsage({
    stripeSubscriptionId: subscriptionId,
    billingPeriodStart: subscription.billing_period_start,
    weeklyCreditsLimit: limits.weeklyCreditsLimit,
    logger,
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

  // Find most recent block grant for this subscription
  const blocks = await db
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        eq(schema.creditLedger.type, 'subscription'),
        eq(schema.creditLedger.stripe_subscription_id, subscriptionId),
      ),
    )
    .orderBy(desc(schema.creditLedger.created_at))
    .limit(1)

  const currentBlock = blocks[0]

  // No block yet or block expired → can start a new one
  if (!currentBlock || !currentBlock.expires_at || currentBlock.expires_at <= now) {
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
      blockResetsAt: currentBlock.expires_at,
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
    blockResetsAt: currentBlock.expires_at,
    weeklyUsed: weekly.used,
    weeklyLimit: weekly.limit,
    weeklyResetsAt: weekly.resetsAt,
    weeklyPercentUsed: weekly.percentUsed,
  }
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
// Subscribe flow (Option B — unify renewal dates)
// ---------------------------------------------------------------------------

/**
 * Handles the first-time-subscribe side-effects:
 * 1. Moves `next_quota_reset` to Stripe's `current_period_end`.
 * 2. Increments `subscription_count`.
 * 3. Migrates unused free/referral credits into a single grant aligned to
 *    the new reset date.
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

  await withAdvisoryLockTransaction({
    callback: async (tx) => {
      // Idempotency: skip if this subscription was already processed
      // Must be inside the lock to prevent TOCTOU races on concurrent webhooks
      const existing = await tx
        .select({ stripe_subscription_id: schema.subscription.stripe_subscription_id })
        .from(schema.subscription)
        .where(eq(schema.subscription.stripe_subscription_id, stripeSubscription.id))
        .limit(1)

      if (existing.length > 0) {
        logger.info(
          { userId, subscriptionId: stripeSubscription.id },
          'Subscription already processed — skipping handleSubscribe',
        )
        return
      }

      // Move next_quota_reset and bump subscription_count
      await tx
        .update(schema.user)
        .set({
          next_quota_reset: newResetDate,
          subscription_count: sql`${schema.user.subscription_count} + 1`,
        })
        .where(eq(schema.user.id, userId))

      // Migrate unused credits so nothing is lost
      await migrateUnusedCredits({ tx, userId, expiresAt: newResetDate, logger })
    },
    lockKey: `user:${userId}`,
    context: { userId, subscriptionId: stripeSubscription.id },
    logger,
  })

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

// ---------------------------------------------------------------------------
// Internal: credit migration
// ---------------------------------------------------------------------------

type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never

/**
 * Migrates unused free & referral credits into a single grant that expires
 * at `expiresAt`. The old grants have their balance zeroed.
 */
async function migrateUnusedCredits(params: {
  tx: DbTransaction
  userId: string
  expiresAt: Date
  logger: Logger
}): Promise<void> {
  const { tx, userId, expiresAt, logger } = params
  const now = new Date()

  // Find all free/referral grants with remaining balance
  const unusedGrants = await tx
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        inArray(schema.creditLedger.type, ['free', 'referral']),
        gt(schema.creditLedger.balance, 0),
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, now),
        ),
      ),
    )

  const totalUnused = unusedGrants.reduce(
    (sum, grant) => sum + grant.balance,
    0,
  )

  if (totalUnused === 0) {
    logger.debug({ userId }, 'No unused credits to migrate')
    return
  }

  // Zero out old grants
  for (const grant of unusedGrants) {
    await tx
      .update(schema.creditLedger)
      .set({ balance: 0 })
      .where(eq(schema.creditLedger.operation_id, grant.operation_id))
  }

  // Create a single migration grant preserving the total
  const operationId = `migration-${userId}-${crypto.randomUUID()}`
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
