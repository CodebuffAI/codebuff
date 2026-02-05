import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { createSubscriptionPriceMappings } from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import {
  getStripeId,
  getUserByStripeCustomerId,
  stripeServer,
} from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'

import { expireActiveBlockGrants, handleSubscribe } from './subscription'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type Stripe from 'stripe'

type SubscriptionStatus = (typeof schema.subscriptionStatusEnum.enumValues)[number]

/**
 * Maps a Stripe subscription status to our local enum.
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  const validStatuses: readonly string[] = schema.subscriptionStatusEnum.enumValues
  if (validStatuses.includes(status)) return status as SubscriptionStatus
  return 'incomplete'
}

export const { getTierFromPriceId, getPriceIdFromTier } = createSubscriptionPriceMappings({
  100: env.STRIPE_SUBSCRIPTION_100_PRICE_ID,
  200: env.STRIPE_SUBSCRIPTION_200_PRICE_ID,
  500: env.STRIPE_SUBSCRIPTION_500_PRICE_ID,
})

// ---------------------------------------------------------------------------
// invoice.paid
// ---------------------------------------------------------------------------

/**
 * Handles a paid invoice for a subscription.
 *
 * - On first payment (`subscription_create`): calls `handleSubscribe` to
 *   migrate the user's renewal date and unused credits.
 * - On every payment: upserts the `subscription` row with fresh billing
 *   period dates from Stripe.
 */
export async function handleSubscriptionInvoicePaid(params: {
  invoice: Stripe.Invoice
  logger: Logger
}): Promise<void> {
  const { invoice, logger } = params

  if (!invoice.subscription) return
  const subscriptionId = getStripeId(invoice.subscription)

  if (!invoice.customer) {
    logger.warn(
      { invoiceId: invoice.id },
      'Subscription invoice has no customer ID',
    )
    return
  }
  const customerId = getStripeId(invoice.customer)

  const stripeSub = await stripeServer.subscriptions.retrieve(subscriptionId)
  const priceId = stripeSub.items.data[0]?.price.id
  if (!priceId) {
    logger.error(
      { subscriptionId },
      'Stripe subscription has no price on first item',
    )
    return
  }

  const tier = getTierFromPriceId(priceId)
  if (!tier) {
    logger.debug(
      { subscriptionId, priceId },
      'Price ID does not match a Strong tier — skipping',
    )
    return
  }

  // Look up the user for this customer
  const user = await getUserByStripeCustomerId(customerId)
  if (!user) {
    logger.warn(
      { customerId, subscriptionId },
      'No user found for customer — skipping handleSubscribe',
    )
    return
  }
  const userId = user.id

  // On first invoice, migrate renewal date & credits
  if (invoice.billing_reason === 'subscription_create') {
    await handleSubscribe({
      userId,
      stripeSubscription: stripeSub,
      logger,
    })
  }

  const status = mapStripeStatus(stripeSub.status)

  // Check for a pending scheduled tier change (downgrade)
  const existingSub = await db
    .select({
      tier: schema.subscription.tier,
      scheduled_tier: schema.subscription.scheduled_tier,
    })
    .from(schema.subscription)
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))
    .limit(1)

  const previousTier = existingSub[0]?.tier
  const hadScheduledTier = existingSub[0]?.scheduled_tier != null

  // Upsert subscription row — always apply the Stripe tier and clear
  // scheduled_tier so pending downgrades take effect on renewal.
  await db
    .insert(schema.subscription)
    .values({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      user_id: userId,
      stripe_price_id: priceId,
      tier,
      scheduled_tier: null,
      status,
      billing_period_start: new Date(stripeSub.current_period_start * 1000),
      billing_period_end: new Date(stripeSub.current_period_end * 1000),
      cancel_at_period_end: stripeSub.cancel_at_period_end,
    })
    .onConflictDoUpdate({
      target: schema.subscription.stripe_subscription_id,
      set: {
        status,
        user_id: userId,
        stripe_price_id: priceId,
        tier,
        scheduled_tier: null,
        billing_period_start: new Date(
          stripeSub.current_period_start * 1000,
        ),
        billing_period_end: new Date(stripeSub.current_period_end * 1000),
        cancel_at_period_end: stripeSub.cancel_at_period_end,
      },
    })

  // If a scheduled downgrade was applied, expire block grants so the user
  // gets new grants at the lower tier's limits.
  if (hadScheduledTier) {
    await expireActiveBlockGrants({ userId, subscriptionId, logger })
    logger.info(
      { userId, subscriptionId, previousTier, tier },
      'Applied scheduled tier change and expired block grants',
    )
  }

  logger.info(
    {
      subscriptionId,
      customerId,
      billingReason: invoice.billing_reason,
    },
    'Processed subscription invoice.paid',
  )
}

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------

/**
 * Immediately sets the subscription to `past_due` — no grace period.
 * User reverts to free-tier behaviour until payment is fixed.
 */
export async function handleSubscriptionInvoicePaymentFailed(params: {
  invoice: Stripe.Invoice
  logger: Logger
}): Promise<void> {
  const { invoice, logger } = params

  if (!invoice.subscription) return
  const subscriptionId = getStripeId(invoice.subscription)
  let userId = null
  if (invoice.customer) {
    const customerId = getStripeId(invoice.customer)
    const user = await getUserByStripeCustomerId(customerId)
    userId = user?.id
  }

  await db
    .update(schema.subscription)
    .set({
      status: 'past_due',
    })
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))

  trackEvent({
    event: AnalyticsEvent.SUBSCRIPTION_PAYMENT_FAILED,
    userId: userId ?? 'system',
    properties: { subscriptionId, invoiceId: invoice.id },
    logger,
  })

  logger.warn(
    { subscriptionId, invoiceId: invoice.id },
    'Subscription payment failed — set to past_due',
  )
}

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------

/**
 * Syncs plan details and cancellation intent from Stripe.
 *
 * Note: Downgrade scheduling is handled by subscription_schedule webhooks.
 * When a user downgrades via Customer Portal with "Wait until end of billing
 * period", Stripe creates a subscription schedule rather than immediately
 * changing the subscription price. The handleSubscriptionScheduleCreatedOrUpdated
 * handler sets scheduled_tier based on the schedule's phases.
 */
export async function handleSubscriptionUpdated(params: {
  stripeSubscription: Stripe.Subscription
  logger: Logger
}): Promise<void> {
  const { stripeSubscription, logger } = params
  const subscriptionId = stripeSubscription.id
  const priceId = stripeSubscription.items.data[0]?.price.id

  if (!priceId) {
    logger.error(
      { subscriptionId },
      'Subscription update has no price — skipping',
    )
    return
  }

  const tier = getTierFromPriceId(priceId)
  if (!tier) {
    logger.debug(
      { subscriptionId, priceId },
      'Price ID does not match a Strong tier — skipping',
    )
    return
  }

  const customerId = getStripeId(stripeSubscription.customer)
  const user = await getUserByStripeCustomerId(customerId)
  if (!user) {
    logger.warn(
      { customerId, subscriptionId },
      'No user found for customer — skipping',
    )
    return
  }
  const userId = user.id

  const status = mapStripeStatus(stripeSubscription.status)

  // Check existing tier to detect upgrades for block grant expiration.
  const existingSub = await db
    .select({
      tier: schema.subscription.tier,
    })
    .from(schema.subscription)
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))
    .limit(1)

  const existingTier = existingSub[0]?.tier

  // Upsert — webhook ordering is not guaranteed by Stripe, so this event
  // may arrive before invoice.paid creates the row.
  // Note: We don't modify scheduled_tier here; that's managed by schedule webhooks.
  await db
    .insert(schema.subscription)
    .values({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      user_id: userId,
      stripe_price_id: priceId,
      tier,
      status,
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
      billing_period_start: new Date(
        stripeSubscription.current_period_start * 1000,
      ),
      billing_period_end: new Date(
        stripeSubscription.current_period_end * 1000,
      ),
    })
    .onConflictDoUpdate({
      target: schema.subscription.stripe_subscription_id,
      set: {
        user_id: userId,
        tier,
        stripe_price_id: priceId,
        status,
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        billing_period_start: new Date(
          stripeSubscription.current_period_start * 1000,
        ),
        billing_period_end: new Date(
          stripeSubscription.current_period_end * 1000,
        ),
      },
    })

  // If this is an upgrade, expire old block grants so the user gets new
  // grants at the higher tier's limits. Also serves as a fallback if the
  // route handler's DB update failed.
  const isUpgrade = existingTier != null && tier > existingTier
  if (isUpgrade) {
    await expireActiveBlockGrants({ userId, subscriptionId, logger })
  }

  logger.info(
    {
      subscriptionId,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      isUpgrade,
    },
    'Processed subscription update',
  )
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

/**
 * Marks the subscription as canceled in our database.
 */
export async function handleSubscriptionDeleted(params: {
  stripeSubscription: Stripe.Subscription
  logger: Logger
}): Promise<void> {
  const { stripeSubscription, logger } = params
  const subscriptionId = stripeSubscription.id

  const customerId = getStripeId(stripeSubscription.customer)
  const user = await getUserByStripeCustomerId(customerId)
  const userId = user?.id ?? null

  const result = await db
    .update(schema.subscription)
    .set({
      status: 'canceled',
      scheduled_tier: null,
      canceled_at: new Date(),
    })
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))
    .returning({ id: schema.subscription.stripe_subscription_id })

  if (result.length === 0) {
    logger.warn(
      { subscriptionId, customerId },
      'No subscription found to cancel — may not exist in our database',
    )
    // Still track the event for observability
    trackEvent({
      event: AnalyticsEvent.SUBSCRIPTION_CANCELED,
      userId: userId ?? 'system',
      properties: { subscriptionId, notFoundInDb: true },
      logger,
    })
    return
  }

  if (userId) {
    await expireActiveBlockGrants({ userId, subscriptionId, logger })
  }

  trackEvent({
    event: AnalyticsEvent.SUBSCRIPTION_CANCELED,
    userId: userId ?? 'system',
    properties: { subscriptionId },
    logger,
  })

  logger.info({ subscriptionId }, 'Subscription canceled')
}

// ---------------------------------------------------------------------------
// subscription_schedule.created / subscription_schedule.updated
// ---------------------------------------------------------------------------

/**
 * Handles subscription schedule creation or updates.
 *
 * When a user schedules a downgrade via Stripe Customer Portal (with "Wait
 * until end of billing period"), Stripe creates a subscription schedule with
 * multiple phases. Phase 0 is the current state, phase 1+ contains the
 * scheduled changes.
 *
 * This handler extracts the scheduled tier from the next phase and stores it
 * in our database so we can show the pending change to the user and apply
 * appropriate limits at renewal.
 */
export async function handleSubscriptionScheduleCreatedOrUpdated(params: {
  schedule: Stripe.SubscriptionSchedule
  logger: Logger
}): Promise<void> {
  const { schedule, logger } = params

  // Only process active schedules
  if (schedule.status !== 'active') {
    logger.debug(
      { scheduleId: schedule.id, status: schedule.status },
      'Ignoring non-active subscription schedule',
    )
    return
  }

  // Get the linked subscription ID
  const subscriptionId = schedule.subscription
    ? getStripeId(schedule.subscription)
    : null

  if (!subscriptionId) {
    logger.warn(
      { scheduleId: schedule.id },
      'Subscription schedule has no linked subscription — skipping',
    )
    return
  }

  // Stripe subscription schedules use "phases" to represent timeline segments:
  //   - Phase 0: The current subscription state (e.g., $200/month)
  //   - Phase 1: The scheduled future state (e.g., $100/month after renewal)
  // We need at least 2 phases to have a pending change; 1 phase means no scheduled change.
  if (!schedule.phases || schedule.phases.length < 2) {
    logger.debug(
      { scheduleId: schedule.id, subscriptionId, phases: schedule.phases?.length },
      'Subscription schedule has fewer than 2 phases — no scheduled change',
    )
    return
  }

  // Extract the scheduled tier from phase 1 (the upcoming change)
  const nextPhase = schedule.phases[1]
  const scheduledPriceId = nextPhase?.items?.[0]?.price
  const priceId = typeof scheduledPriceId === 'string'
    ? scheduledPriceId
    : scheduledPriceId?.id

  if (!priceId) {
    logger.warn(
      { scheduleId: schedule.id, subscriptionId },
      'Subscription schedule next phase has no price — skipping',
    )
    return
  }

  const scheduledTier = getTierFromPriceId(priceId)
  if (!scheduledTier) {
    logger.debug(
      { scheduleId: schedule.id, subscriptionId, priceId },
      'Scheduled price ID does not match a Strong tier — skipping',
    )
    return
  }

  // Update the subscription with the scheduled tier
  const result = await db
    .update(schema.subscription)
    .set({
      scheduled_tier: scheduledTier,
    })
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))
    .returning({ tier: schema.subscription.tier })

  if (result.length === 0) {
    logger.warn(
      { scheduleId: schedule.id, subscriptionId, scheduledTier },
      'No subscription found to update with scheduled tier — may arrive before subscription created',
    )
    return
  }

  const currentTier = result[0]?.tier

  logger.info(
    {
      scheduleId: schedule.id,
      subscriptionId,
      currentTier,
      scheduledTier,
      scheduledStartDate: nextPhase.start_date
        ? new Date(nextPhase.start_date * 1000).toISOString()
        : null,
    },
    'Set scheduled tier from subscription schedule',
  )
}

// ---------------------------------------------------------------------------
// subscription_schedule.released / subscription_schedule.canceled
// ---------------------------------------------------------------------------

/**
 * Handles subscription schedule release or cancellation.
 *
 * When a schedule is released (completes and detaches from the subscription)
 * or canceled (user cancels the pending change), we clear the scheduled_tier.
 *
 * Note: When a schedule "releases" after applying its final phase, the
 * subscription itself gets updated, which triggers invoice.paid at renewal.
 * That handler already clears scheduled_tier, but this provides a safety net.
 */
export async function handleSubscriptionScheduleReleasedOrCanceled(params: {
  schedule: Stripe.SubscriptionSchedule
  logger: Logger
}): Promise<void> {
  const { schedule, logger } = params

  // When a schedule is released, the subscription field becomes null and
  // the subscription ID moves to released_subscription. When canceled,
  // the subscription field is retained. Check both fields.
  const subscriptionId = schedule.subscription
    ? getStripeId(schedule.subscription)
    : schedule.released_subscription
      ? getStripeId(schedule.released_subscription)
      : null

  if (!subscriptionId) {
    logger.debug(
      { scheduleId: schedule.id },
      'Released/canceled schedule has no subscription — skipping',
    )
    return
  }

  const result = await db
    .update(schema.subscription)
    .set({
      scheduled_tier: null,
    })
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))
    .returning({ tier: schema.subscription.tier })

  if (result.length === 0) {
    logger.debug(
      { scheduleId: schedule.id, subscriptionId },
      'No subscription found when clearing scheduled tier — may already be deleted',
    )
    return
  }

  logger.info(
    {
      scheduleId: schedule.id,
      subscriptionId,
      status: schedule.status,
    },
    'Cleared scheduled tier after subscription schedule released/canceled',
  )
}
