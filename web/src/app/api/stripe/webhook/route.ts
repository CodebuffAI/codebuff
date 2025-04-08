import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'

import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import {
  convertStripeGrantAmountToCredits,
  getUserCostPerCredit,
} from 'common/src/billing/conversion'
import { match, P } from 'ts-pattern'
import { GrantType } from 'common/types/grant'
import { GRANT_PRIORITIES } from 'common/src/billing/balance-calculator'

async function handleCreditGrantCreated(grant: Stripe.Billing.CreditGrant) {
  const operationId = grant.metadata?.local_operation_id ?? grant.id
  const grantType = (grant.metadata?.type as GrantType | undefined) ?? 'free'
  const priority = parseInt(
    grant.metadata?.priority ?? GRANT_PRIORITIES[grantType].toString()
  )

  try {
    // Get userId directly from database using customer ID
    const userId = await db.query.user
      .findFirst({
        where: eq(schema.user.stripe_customer_id, grant.customer as string),
        columns: { id: true },
      })
      .then((user) => user?.id)

    if (!userId) {
      logger.error(
        { grantId: grant.id, customerId: grant.customer },
        'Credit grant created but no user found with customer ID'
      )
      // Don't retry - this is a data consistency issue that won't resolve itself
      return
    }

    const existingGrant = await db.query.creditGrants.findFirst({
      where: eq(schema.creditGrants.operation_id, operationId),
    })

    if (existingGrant) {
      await db
        .update(schema.creditGrants)
        .set({
          stripe_grant_id: grant.id,
        })
        .where(eq(schema.creditGrants.operation_id, operationId))

      logger.info(
        { grantId: grant.id, operationId, userId },
        'Updated local credit grant with Stripe grant ID'
      )
      return
    }

    const amountInCents = grant.amount.monetary?.value ?? 0
    const creditCost = await getUserCostPerCredit(userId)
    const credits = convertStripeGrantAmountToCredits(amountInCents, creditCost)

    await db.insert(schema.creditGrants).values({
      operation_id: operationId,
      user_id: userId,
      amount: credits,
      type: grantType,
      priority,
      stripe_grant_id: grant.id,
      expires_at: grant.expires_at ? new Date(grant.expires_at * 1000) : null,
    })

    logger.info(
      { grantId: grant.id, operationId, userId, credits, grantType, priority },
      'Created local credit grant from Stripe webhook'
    )
  } catch (err) {
    // Log the error with full context
    logger.error(
      {
        error: err,
        grantId: grant.id,
        operationId,
        grantType,
        customerId: grant.customer,
      },
      'Failed to process credit grant webhook'
    )
    // Re-throw to trigger Stripe retry
    throw err
  }
}

async function handleCreditGrantUpdated(grant: Stripe.Billing.CreditGrant) {
  const existingGrant = await db.query.creditGrants.findFirst({
    where: eq(schema.creditGrants.stripe_grant_id, grant.id),
    columns: { operation_id: true, user_id: true },
  })

  if (!existingGrant) {
    logger.warn(
      { grantId: grant.id },
      'Credit grant updated but no matching local grant found'
    )
    return
  }

  const amountInCents = grant.amount.monetary?.value ?? 0
  const creditCost = await getUserCostPerCredit(existingGrant.user_id)
  const credits = convertStripeGrantAmountToCredits(amountInCents, creditCost)

  await db
    .update(schema.creditGrants)
    .set({
      amount: credits,
      expires_at: grant.expires_at ? new Date(grant.expires_at * 1000) : null,
    })
    .where(eq(schema.creditGrants.stripe_grant_id, grant.id))

  logger.info(
    { grantId: grant.id, userId: existingGrant.user_id, credits },
    'Updated local credit grant from Stripe webhook'
  )
}

async function handleCustomerCreated(customer: Stripe.Customer) {
  logger.info({ customerId: customer.id }, 'New customer created')
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  logger.info(
    {
      subscriptionId: subscription.id,
      status: subscription.status,
      customerId: subscription.customer,
    },
    'Subscription event received'
  )
}

const webhookHandler = async (req: NextRequest): Promise<NextResponse> => {
  let event: Stripe.Event
  try {
    const buf = await req.text()
    const sig = req.headers.get('stripe-signature')!

    event = stripeServer.webhooks.constructEvent(
      buf,
      sig,
      env.STRIPE_WEBHOOK_SECRET_KEY
    )
  } catch (err) {
    const error = err as Error
    logger.error(
      { error: error.message },
      'Webhook signature verification failed'
    )
    return NextResponse.json(
      { error: { message: `Webhook Error: ${error.message}` } },
      { status: 400 }
    )
  }

  logger.info({ type: event.type }, 'Received Stripe webhook event')

  try {
    switch (event.type) {
      case 'customer.created':
        // Misnomer; we always create a customer when a user signs up.
        // We should use this webhook to send general onboarding material, welcome emails, etc.
        break
      case 'billing.credit_grant.created': {
        await handleCreditGrantCreated(
          event.data.object as Stripe.Billing.CreditGrant
        )
        break
      }
      case 'billing.credit_grant.updated': {
        await handleCreditGrantUpdated(
          event.data.object as Stripe.Billing.CreditGrant
        )
        break
      }
      default:
        console.log(`Unhandled event type ${event.type}`)
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    const error = err as Error
    logger.error(
      { error: error.message, eventType: event.type },
      'Error processing webhook'
    )
    return NextResponse.json(
      { error: { message: `Webhook handler error: ${error.message}` } },
      { status: 500 }
    )
  }
}

export { webhookHandler as POST }
