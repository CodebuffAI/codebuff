import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq, or, sql, SQL, sum } from 'drizzle-orm'

import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { CREDITS_USAGE_LIMITS, UsageLimits } from 'common/constants'
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
        await handleSubscriptionChange(event.data.object, UsageLimits.PRO)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object, UsageLimits.PRO)
        break
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

async function getTotalReferralCreditsForCustomer(
  customerId: string
): Promise<number> {
  return db
    .select({
      referralCredits: sum(schema.referral.credits),
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

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  usageTier: UsageLimits
) {
  const customerId = getCustomerId(subscription.customer)
  console.log(`Customer ID: ${customerId}`)

  // Get the user ID from the customer ID
  const user = await db.query.user.findFirst({
    where: eq(schema.user.stripe_customer_id, customerId),
    columns: { id: true },
  })

  if (!user) {
    throw new Error('No user found for customer ID')
  }
  console.log(`Found user ID: ${user.id}`)

  // Get quota from Stripe subscription
  const quotaManager = new AuthenticatedQuotaManager()
  const { quota } = await quotaManager.getStripeSubscriptionQuota(user.id)
  const baseQuota = Math.max(quota, CREDITS_USAGE_LIMITS[usageTier])

  // Add referral credits
  const referralCredits = await getTotalReferralCreditsForCustomer(customerId)
  const newQuota = baseQuota + referralCredits
  console.log(
    `Calculated new quota: ${newQuota} (base: ${baseQuota}, referral: ${referralCredits})`
  )

  let newSubscriptionId: string | null = subscription.id
  if (subscription.cancellation_details?.reason) {
    console.log(
      `Subscription cancelled: ${subscription.cancellation_details.reason}`
    )
    newSubscriptionId = null
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

  // Apply referral credits to the user's Stripe usage
  if (referralCredits > 0) {
    await stripeServer.billing.meterEvents.create({
      event_name: 'credits',
      timestamp: Math.floor(new Date().getTime() / 1000),
      payload: {
        stripe_customer_id: customerId,
        value: `-${referralCredits}`,
      },
    })

    // Add note explaining the referral credit adjustment
    await stripeServer.invoices.update(invoiceCreated.data.object.id, {
      description: `Referral bonus: ${referralCredits} credits deducted`,
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
