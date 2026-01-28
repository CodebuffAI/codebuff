import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import {
  getStripeId,
  getUserByStripeCustomerId,
  stripeServer,
} from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'

import { handleSubscribe } from './subscription'

import type { SubscriptionTierPrice } from '@codebuff/common/constants/subscription-plans'
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

const priceToTier: Record<string, SubscriptionTierPrice> = {
  ...(env.STRIPE_SUBSCRIPTION_100_PRICE_ID && { [env.STRIPE_SUBSCRIPTION_100_PRICE_ID]: 100 as const }),
  ...(env.STRIPE_SUBSCRIPTION_200_PRICE_ID && { [env.STRIPE_SUBSCRIPTION_200_PRICE_ID]: 200 as const }),
  ...(env.STRIPE_SUBSCRIPTION_500_PRICE_ID && { [env.STRIPE_SUBSCRIPTION_500_PRICE_ID]: 500 as const }),
}

function getTierFromPriceId(priceId: string): SubscriptionTierPrice | null {
  return priceToTier[priceId] ?? null
}

const tierToPrice = Object.fromEntries(
  Object.entries(priceToTier).map(([priceId, tier]) => [tier, priceId]),
) as Partial<Record<SubscriptionTierPrice, string>>

export function getTierPriceId(tier: SubscriptionTierPrice): string | null {
  return tierToPrice[tier] ?? null
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
  const subscriptionId = getStripeId(invoice.subscription)
  const customerId = getStripeId(invoice.customer)

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

  // Look up the user for this customer
  const userId = (await getUserByStripeCustomerId(customerId))?.id ?? null

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
      tier: getTierFromPriceId(priceId),
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
        tier: getTierFromPriceId(priceId),
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
  const customerId = getStripeId(invoice.customer)
  const userId = customerId
    ? (await getUserByStripeCustomerId(customerId))?.id ?? null
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

  const customerId = getStripeId(stripeSubscription.customer)
  const userId = (await getUserByStripeCustomerId(customerId))?.id ?? null

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
      tier: getTierFromPriceId(priceId),
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
        tier: getTierFromPriceId(priceId),
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

  const customerId = getStripeId(stripeSubscription.customer)
  const userId = (await getUserByStripeCustomerId(customerId))?.id ?? null

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
