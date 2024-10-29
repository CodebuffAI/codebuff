import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq, or, sum } from 'drizzle-orm'

import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { match, P } from 'ts-pattern'

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
        await handleSubscriptionChange(event.data.object, 'PAID')
        break
      case 'customer.subscription.deleted':
        // Only downgrade to FREE tier when subscription period has ended
        await handleSubscriptionChange(event.data.object, 'FREE')
        break
      case 'invoice.paid':
        await handleInvoicePaid(event)
        break
      default:
        console.log(`Unhandled event type ${event.type}`)
    }
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Method Not Allowed',
        },
      },
      { status: 405 }
    )
  }
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  usageTier: keyof typeof CREDITS_USAGE_LIMITS
) {
  const customerId = getCustomerId(subscription.customer)

  // Fetch the user's current quota and referral credits
  const userCredits = await db
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
      if (rows.length < 1) {
        return
      }
      return rows[0]
    })

  const baseQuota = CREDITS_USAGE_LIMITS[usageTier]
  const newQuota = baseQuota + parseInt(userCredits?.referralCredits ?? '0')

  // TODO: If downgrading, check Stripe to see if they have exceeded quota, don't just blindly reset. But for now it's fine to just trust them.
  // A good indicator that we've created compelling value is if people are subscribing and unsubscribing just to get some more free usage
  await db
    .update(schema.user)
    .set({
      quota_exceeded: false,
      quota: newQuota,
      subscription_active: usageTier === 'PAID',
      stripe_price_id: subscription.id,
    })
    .where(eq(schema.user.stripe_customer_id, customerId))
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

  // thirty days from now
  // const default_next_quota_reset = new Date().getTime() + 30 * 24 * 60 * 60 * 1000

  await db
    .update(schema.user)
    .set({
      quota_exceeded: false,
      // next_quota_reset: new Date(
      //   invoicePaid.data.object.next_payment_attempt ?? default_next_quota_reset
      // ),
      subscription_active: true,
      stripe_price_id: subscriptionId,
    })
    .where(eq(schema.user.stripe_customer_id, customerId))
}

export { webhookHandler as POST }
