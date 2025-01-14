import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq, sql, SQL } from 'drizzle-orm'

import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'
import {
  getPlanFromPriceId,
  getSubscriptionItemByType,
  getTotalReferralCreditsForCustomer,
} from '@/lib/stripe-utils'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { PLAN_CONFIGS, UsageLimits } from 'common/constants'
import { match, P } from 'ts-pattern'
import { AuthenticatedQuotaManager } from 'common/billing/quota-manager'

const getCustomerId = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
) => {
  return match(customer)
    .with(
      // string ID case
      P.string,
      (id) => id
    )
    .with(
      // Customer or DeletedCustomer case
      { object: 'customer' },
      (customer) => customer.id
    )
    .exhaustive()
}


const webhookHandler = async (req: NextRequest): Promise<NextResponse> => {
  try {
    const buf = await req.text()
    const sig = req.headers.get('stripe-signature')!

    let event: Stripe.Event

    try {
      event = stripeServer.webhooks.constructEvent(
        buf,
        sig,
        env.STRIPE_WEBHOOK_SECRET_KEY
      )
    } catch (err) {
      return NextResponse.json(
        {
          error: {
            message: `Webhook Error - ${err}`,
          },
        },
        { status: 400 }
      )
    }

    switch (event.type) {
      case 'customer.created':
        // Misnomer; we always create a customer when a user signs up.
        // We should use this webhook to send general onboarding material, welcome emails, etc.
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // Determine plan type from subscription items
        const subscription = event.data.object as Stripe.Subscription

        // Handle subscription states with ts-pattern match
        await match(subscription)
          .with(
            { status: P.union('incomplete_expired', 'unpaid') },
            async (sub) => {
              // Immediately downgrade for payment-related failures
              await handleSubscriptionChange(sub, UsageLimits.FREE)
            }
          )
          .with({ status: 'canceled', cancel_at_period_end: true }, () => {
            // Keep user on current plan until period end
            // No action needed, subscription.deleted event will handle the downgrade
          })
          .with(
            { status: 'canceled', cancel_at_period_end: false },
            async (sub) => {
              // Immediate cancellation, downgrade now
              await handleSubscriptionChange(sub, UsageLimits.FREE)
            }
          )
          .otherwise(async (sub) => {
            // For other states (active, trialing, past_due), proceed normally
            const basePriceId = getSubscriptionItemByType(sub, 'licensed')
            const plan = getPlanFromPriceId(basePriceId?.price.id)
            await handleSubscriptionChange(sub, plan)
          })
        break
      }
      case 'customer.subscription.deleted':
        // Only downgrade to FREE tier when subscription period has ended
        await handleSubscriptionChange(event.data.object, UsageLimits.FREE)
        break
      case 'invoice.created':
        await handleInvoiceCreated(event)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event)
        break
      default:
        console.log(`Unhandled event type ${event.type}`)
        return NextResponse.json(
          {
            error: {
              message: 'Method Not Allowed',
            },
          },
          { status: 405 }
        )
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    const error = err as Error
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      {
        error: {
          message: error.message,
        },
      },
      { status: 500 }
    )
  }
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  usageTier: UsageLimits
) {
  const customerId = getCustomerId(subscription.customer)
  console.log(`Customer ID: ${customerId}`)

  // Get quota from the target plan and add referral credits
  const baseQuota = PLAN_CONFIGS[usageTier].limit
  const referralCredits = await getTotalReferralCreditsForCustomer(customerId)
  const newQuota = baseQuota + referralCredits
  console.log(
    `Calculated new quota: ${newQuota} (base: ${baseQuota}, referral: ${referralCredits})`
  )

  let newSubscriptionId: string | null = subscription.id
  if (subscription.canceled_at) {
    const cancelTime = new Date(subscription.canceled_at * 1000)
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
    
    if (cancelTime <= fiveMinutesFromNow) {
      console.log(
        `Subscription cancelled at ${cancelTime.toISOString()}`
      )
      newSubscriptionId = null
    }
  }
  console.log(`New subscription ID: ${newSubscriptionId}`)

  await db
    .update(schema.user)
    .set({
      quota_exceeded: false,
      quota: newQuota,
      next_quota_reset: new Date(subscription.current_period_end * 1000),
      subscription_active: !!newSubscriptionId,
      stripe_price_id: newSubscriptionId,
    })
    .where(eq(schema.user.stripe_customer_id, customerId))
}

async function handleInvoiceCreated(
  invoiceCreated: Stripe.InvoiceCreatedEvent
) {
  const customer = invoiceCreated.data.object.customer

  if (!customer) {
    throw new Error('No customer found in invoice paid event')
  }

  const customerId = getCustomerId(customer)

  // Get total referral credits for this user
  const referralCredits = await getTotalReferralCreditsForCustomer(customerId)
  if (referralCredits > 0) {
    await stripeServer.billing.meterEvents.create({
      event_name: 'credits',
      timestamp: Math.floor(new Date().getTime() / 1000),
      payload: {
        stripe_customer_id: customerId,
        value: `-${referralCredits}`,
        description: `Referral bonus: your bill was reduced by ${referralCredits} credits.`,
      },
    })
  }
}

async function handleInvoicePaid(invoicePaid: Stripe.InvoicePaidEvent) {
  const customer = invoicePaid.data.object.customer

  if (!customer) {
    throw new Error('No customer found in invoice paid event')
  }

  const customerId = getCustomerId(customer)
  const subscriptionId = match(invoicePaid.data.object.subscription)
    .with(P.string, (id) => id)
    .with({ object: 'subscription' }, (subscription) => subscription.id)
    .otherwise(() => null)

  // Next month
  const nextQuotaReset: SQL<string> | Date = invoicePaid.data.object
    .next_payment_attempt
    ? new Date(invoicePaid.data.object.next_payment_attempt * 1000)
    : sql<string>`now() + INTERVAL '1 month'`

  await db
    .update(schema.user)
    .set({
      quota_exceeded: false,
      next_quota_reset: nextQuotaReset,
      subscription_active: true,
      stripe_price_id: subscriptionId,
    })
    .where(eq(schema.user.stripe_customer_id, customerId))
}

export { webhookHandler as POST }
