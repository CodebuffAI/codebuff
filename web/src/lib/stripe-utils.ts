import { stripeServer } from 'common/src/util/stripe'
import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { env } from '@/env.mjs'
import type Stripe from 'stripe'
import { match } from 'ts-pattern'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { sql } from 'drizzle-orm'
import { or, eq } from 'drizzle-orm'

export type PlanPriceIds = {
  priceId: string
  overagePriceId: string
}

export function getSubscriptionItemByType(
  subscription: Stripe.Subscription,
  usageType: 'licensed' | 'metered'
) {
  return subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === usageType
  )
}

export function getPlanFromPriceId(priceId: string | undefined): UsageLimits {
  if (priceId === env.STRIPE_PRO_PRICE_ID) {
    return UsageLimits.PRO
  }
  if (priceId === env.STRIPE_MOAR_PRO_PRICE_ID) {
    return UsageLimits.MOAR_PRO
  }
  return UsageLimits.FREE
}

export function getPlanPriceIds(targetPlan: string): PlanPriceIds | null {
  return match(targetPlan)
    .with(UsageLimits.PRO, () => ({
      priceId: env.STRIPE_PRO_PRICE_ID,
      overagePriceId: env.STRIPE_PRO_OVERAGE_PRICE_ID,
    }))
    .with(UsageLimits.MOAR_PRO, () => ({
      priceId: env.STRIPE_MOAR_PRO_PRICE_ID,
      overagePriceId: env.STRIPE_MOAR_PRO_OVERAGE_PRICE_ID,
    }))
    .otherwise(() => null)
}

export async function getCurrentSubscription(customerId: string) {
  const subscriptions = await stripeServer.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })
  return subscriptions.data[0]
}

export async function validatePlanChange(
  targetPlan: UsageLimits | null,
  customerId: string
) {
  if (!targetPlan) {
    return {
      error: {
        code: 'invalid-plan',
        message: 'Target plan is required',
      },
      status: 400,
    }
  }

  const planConfig = PLAN_CONFIGS[targetPlan]
  if (!planConfig || !planConfig.monthlyPrice) {
    return {
      error: {
        code: 'invalid-plan',
        message: 'Invalid target plan',
      },
      status: 400,
    }
  }

  const currentSubscription = await getCurrentSubscription(customerId)
  if (currentSubscription) {
    // Check subscription status
    if (currentSubscription.status !== 'active') {
      return {
        error: {
          code: 'invalid-subscription-state',
          message: match(currentSubscription.status)
            .with(
              'past_due',
              () =>
                'Your subscription has past due payments. Please update your payment method.'
            )
            .with(
              'canceled',
              () =>
                'Your subscription has been canceled. Please reactivate your subscription first.'
            )
            .with(
              'incomplete',
              () =>
                'Your subscription setup is incomplete. Please complete the setup first.'
            )
            .with(
              'incomplete_expired',
              () =>
                'Your previous subscription attempt expired. Please try again.'
            )
            .otherwise(
              () => 'Your subscription is not in an active state for upgrades.'
            ),
        },
        status: 400,
      }
    }

    // Check for trial periods
    if (currentSubscription.trial_end) {
      const trialEnd = new Date(currentSubscription.trial_end * 1000)
      if (trialEnd > new Date()) {
        return {
          error: {
            code: 'trial-active',
            message:
              'Please wait until your trial period ends before changing plans.',
          },
          status: 400,
        }
      }
    }

    const priceIds = getPlanPriceIds(targetPlan as string)
    if (!priceIds) {
      return {
        error: {
          code: 'invalid-plan',
          message: 'Invalid target plan',
        },
        status: 400,
      }
    }
    const licensedItem = getSubscriptionItemByType(
      currentSubscription,
      'licensed'
    )
    const meteredItem = getSubscriptionItemByType(
      currentSubscription,
      'metered'
    )

    if (!licensedItem || !meteredItem) {
      throw new Error('Missing required subscription items')
    }

    const { overagePriceId, priceId } = priceIds
    if (
      licensedItem.price.id === priceId &&
      meteredItem.price.id === overagePriceId
    ) {
      return {
        error: {
          code: 'invalid-upgrade',
          message: 'You are already subscribed to this plan.',
        },
        status: 400,
      }
    }
  }

  return { planConfig }
}

export async function checkForUnpaidInvoices(customerId: string) {
  const unpaidInvoices = await stripeServer.invoices.list({
    customer: customerId,
    status: 'open',
  })

  if (unpaidInvoices.data.length > 0) {
    return {
      error: {
        message:
          'You have unpaid invoices. Please check your email or contact support.',
      },
      status: 400,
    }
  }
}

export async function getTotalReferralCreditsForCustomer(
  customerId: string
): Promise<number> {
  return db
    .select({
      referralCredits: sql<string>`SUM(COALESCE(${schema.referral.credits}, 0))`,
    })
    .from(schema.user)
    .leftJoin(
      schema.referral,
      or(
        eq(schema.referral.referrer_id, schema.user.id),
        eq(schema.referral.referred_id, schema.user.id)
      )
    )
    .where(eq(schema.user.stripe_customer_id, customerId))
    .limit(1)
    .then((rows) => {
      const firstRow = rows[0]
      return parseInt(firstRow?.referralCredits ?? '0')
    })
}
