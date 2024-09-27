import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'

import { env } from '@/env.mjs'
import { stripeServer } from '@/lib/stripe'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { TOKEN_USAGE_LIMITS } from 'common/constants'
import { match, P } from 'ts-pattern'

const webhookHandler = async (req: NextRequest) => {
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

    const subscription = event.data.object as Stripe.Subscription

    switch (event.type) {
      case 'customer.created':
        // Misnomer; we always create a customer when a user signs up.
        // We should use this webhook to send general onboarding material, welcome emails, etc.
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(subscription, 'PAID')
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(subscription, 'FREE')
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
    ).headers.set('Allow', 'POST')
  }
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  usageTier: keyof typeof TOKEN_USAGE_LIMITS
) {
  const newLimit = TOKEN_USAGE_LIMITS[usageTier]
  const customerId = match(subscription.customer)
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

  await db
    .update(schema.user)
    .set({ subscriptionActive: usageTier === 'ANON', limit: newLimit })
    .where(eq(schema.user.stripeCustomerId, customerId))
}

export { webhookHandler as POST }
