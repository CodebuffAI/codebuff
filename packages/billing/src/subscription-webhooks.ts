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
        updated_at: new Date(),
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
      updated_at: new Date(),
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

  // Check existing tier to detect downgrades. During a downgrade the old
  // higher tier is kept in `scheduled_tier` so limits remain until renewal.
  const existingSub = await db
    .select({
      tier: schema.subscription.tier,
      scheduled_tier: schema.subscription.scheduled_tier,
    })
    .from(schema.subscription)
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))
    .limit(1)

  const existingTier = existingSub[0]?.tier
  const isDowngrade = existingTier != null && existingTier > tier

  // Upsert — webhook ordering is not guaranteed by Stripe, so this event
  // may arrive before invoice.paid creates the row.
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
        // Downgrade: preserve current tier & stripe_price_id, schedule the
        // new tier for the next billing period.
        ...(isDowngrade
          ? { scheduled_tier: tier }
          : { tier, stripe_price_id: priceId, scheduled_tier: null }),
        status,
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        billing_period_start: new Date(
          stripeSubscription.current_period_start * 1000,
        ),
        billing_period_end: new Date(
          stripeSubscription.current_period_end * 1000,
        ),
        updated_at: new Date(),
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
      isDowngrade,
      isUpgrade,
    },
    isDowngrade
      ? 'Processed subscription update — downgrade scheduled for next billing period'
      : 'Processed subscription update',
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

  await db
    .update(schema.subscription)
    .set({
      status: 'canceled',
      scheduled_tier: null,
      canceled_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))

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
