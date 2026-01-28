import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { PLANS } from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'

import { handleSubscribe } from './subscription'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { PlanConfig } from '@codebuff/common/constants/subscription-plans'
import type Stripe from 'stripe'

type SubscriptionStatus = (typeof schema.subscriptionStatusEnum.enumValues)[number]

/**
 * Maps a Stripe subscription status to our local enum.
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'past_due') return 'past_due'
  if (status === 'canceled') return 'canceled'
  return 'active'
}

/**
 * Looks up a user ID by Stripe customer ID.
 */
async function getUserIdByCustomerId(
  customerId: string,
): Promise<string | null> {
  const userRecord = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.stripe_customer_id, customerId))
    .limit(1)
  return userRecord[0]?.id ?? null
}

/**
 * Resolves a PlanConfig from a Stripe price ID.
 * Compares against the configured env var for each plan.
 */
function getPlanFromPriceId(priceId: string): PlanConfig {
  if (!env.STRIPE_SUBSCRIPTION_200_PRICE_ID) {
    throw new Error(
      'STRIPE_SUBSCRIPTION_200_PRICE_ID env var is not configured',
    )
  }
  if (env.STRIPE_SUBSCRIPTION_200_PRICE_ID === priceId) {
    return PLANS.pro
  }
  throw new Error(`Unknown subscription price ID: ${priceId}`)
}

// ---------------------------------------------------------------------------
// invoice.paid
// ---------------------------------------------------------------------------

/**
 * Handles a paid invoice for a subscription.
 *
 * - On first payment (`subscription_create`): calls `handleSubscribe` to
 *   migrate the user's renewal date and unused credits (Option B).
 * - On every payment: upserts the `subscription` row with fresh billing
 *   period dates from Stripe.
 */
export async function handleSubscriptionInvoicePaid(params: {
  invoice: Stripe.Invoice
  logger: Logger
}): Promise<void> {
  const { invoice, logger } = params

  if (!invoice.subscription) return
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id

  if (!customerId) {
    logger.warn(
      { invoiceId: invoice.id },
      'Subscription invoice has no customer ID',
    )
    return
  }

  const stripeSub = await stripeServer.subscriptions.retrieve(subscriptionId)
  const priceId = stripeSub.items.data[0]?.price.id
  if (!priceId) {
    logger.error(
      { subscriptionId },
      'Stripe subscription has no price on first item',
    )
    return
  }

  let plan: PlanConfig
  try {
    plan = getPlanFromPriceId(priceId)
  } catch {
    logger.warn(
      { subscriptionId, priceId },
      'Subscription invoice for unrecognised price — skipping',
    )
    return
  }

  // Look up the user for this customer
  const userId = await getUserIdByCustomerId(customerId)

  // On first invoice, migrate renewal date & credits (Option B)
  if (invoice.billing_reason === 'subscription_create') {
    if (userId) {
      await handleSubscribe({
        userId,
        stripeSubscription: stripeSub,
        logger,
      })
    } else {
      logger.warn(
        { customerId, subscriptionId },
        'No user found for customer — skipping handleSubscribe',
      )
    }
  }

  // Upsert subscription row
  await db
    .insert(schema.subscription)
    .values({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      user_id: userId,
      stripe_price_id: priceId,
      plan_name: plan.name,
      status: 'active',
      billing_period_start: new Date(stripeSub.current_period_start * 1000),
      billing_period_end: new Date(stripeSub.current_period_end * 1000),
      cancel_at_period_end: stripeSub.cancel_at_period_end,
    })
    .onConflictDoUpdate({
      target: schema.subscription.stripe_subscription_id,
      set: {
        status: 'active',
        ...(userId ? { user_id: userId } : {}),
        stripe_price_id: priceId,
        plan_name: plan.name,
        billing_period_start: new Date(
          stripeSub.current_period_start * 1000,
        ),
        billing_period_end: new Date(stripeSub.current_period_end * 1000),
        cancel_at_period_end: stripeSub.cancel_at_period_end,
        updated_at: new Date(),
      },
    })

  logger.info(
    {
      subscriptionId,
      customerId,
      planName: plan.name,
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
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id

  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id
  const userId = customerId
    ? await getUserIdByCustomerId(customerId)
    : null

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

  let planName: string
  try {
    const plan = getPlanFromPriceId(priceId)
    planName = plan.name
  } catch {
    logger.warn(
      { subscriptionId, priceId },
      'Subscription updated with unrecognised price — skipping',
    )
    return
  }

  const customerId =
    typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer.id
  const userId = await getUserIdByCustomerId(customerId)

  const status = mapStripeStatus(stripeSubscription.status)

  // Upsert — webhook ordering is not guaranteed by Stripe, so this event
  // may arrive before invoice.paid creates the row.
  await db
    .insert(schema.subscription)
    .values({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      user_id: userId,
      stripe_price_id: priceId,
      plan_name: planName,
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
        ...(userId ? { user_id: userId } : {}),
        stripe_price_id: priceId,
        plan_name: planName,
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

  logger.info(
    {
      subscriptionId,
      planName,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
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

  const customerId =
    typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer.id
  const userId = await getUserIdByCustomerId(customerId)

  await db
    .update(schema.subscription)
    .set({
      status: 'canceled',
      canceled_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(schema.subscription.stripe_subscription_id, subscriptionId))

  trackEvent({
    event: AnalyticsEvent.SUBSCRIPTION_CANCELED,
    userId: userId ?? 'system',
    properties: { subscriptionId },
    logger,
  })

  logger.info({ subscriptionId }, 'Subscription canceled')
}
