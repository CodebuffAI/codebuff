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

  try {
    await db.transaction(async (tx) => {
      // 1. Find the user based on the Stripe customer ID, and update their subscription info.
      const userId = await tx
        .update(schema.user)
        .set({
          subscriptionActive: usageTier === 'PAID',
          stripePlanId: subscription.id,
        })
        .where(eq(schema.user.stripeCustomerId, customerId))
        .returning({ userId: schema.user.id })
        .then((users) => {
          if (users.length === 1) {
            return users[0].userId
          }
          throw new Error(`No user found for Stripe customer ID: ${customerId}`)
        })

      // 2. Create or update the usage record for the user
      const usageId = await tx
        .insert(schema.usage)
        .values({
          userId,
          limit: newLimit,
          startDate: new Date(subscription.current_period_start * 1000),
          endDate: new Date(subscription.current_period_end * 1000),
          type: 'token',
        })
        .onConflictDoUpdate({
          target: [schema.usage.userId, schema.usage.startDate],
          set: {
            limit: newLimit,
          },
        })
        .returning({
          id: schema.usage.id,
        })
        .then((usages) => {
          if (usages.length === 1) {
            return usages[0].id
          }
          throw new Error(`Error creating usage record userId: ${userId}`)
        })

      // 3. Update the session table to link to the new usage record on all sessions containing the userId
      await tx
        .update(schema.session)
        .set({
          usageId,
        })
        .where(eq(schema.session.userId, userId))
    })
  } catch (error) {
    console.error('Error updating subscription:', error)
    throw error
  }
}

export { webhookHandler as POST }
