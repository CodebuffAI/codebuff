import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq, sql, SQL, and, isNull } from 'drizzle-orm'

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

async function handleCreditGrantCreated(grant: Stripe.Billing.CreditGrant) {
  const userId = grant.metadata?.user_id
  if (!userId) {
    logger.error(
      { grantId: grant.id, metadata: grant.metadata },
      'Missing user_id in metadata for credit grant created event'
    )
    return
  }

  let amountInCents: number
  if (
    grant.amount &&
    grant.amount.type === 'monetary' &&
    grant.amount.monetary?.value !== undefined
  ) {
    amountInCents = grant.amount.monetary.value
  } else {
    logger.error(
      { grantId: grant.id, amountObject: grant.amount },
      'Invalid or missing monetary amount in credit grant created event'
    )
    return
  }

  const customerId = getCustomerId(grant.customer)
  const grantType = (grant.metadata?.type || 'admin') as schema.GrantType
  const priority =
    typeof grant.priority === 'number' && !isNaN(grant.priority)
      ? grant.priority
      : 50
  const description = grant.metadata?.description || `Stripe Grant ${grant.id}`
  const expiresAt = grant.expires_at ? new Date(grant.expires_at * 1000) : null

  logger.info(
    {
      userId: userId,
      grantId: grant.id,
      stripeAmountCents: amountInCents,
      type: grantType,
      priority: priority,
      customerId: customerId,
      metadata: grant.metadata,
      grantPriorityField: grant.priority,
    },
    'Processing credit grant creation'
  )

  try {
    const centsPerCredit = await getUserCostPerCredit(userId)
    if (centsPerCredit <= 0) {
      logger.error(
        { userId, grantId: grant.id, centsPerCredit },
        'Invalid centsPerCredit for user, cannot process grant.'
      )
      return
    }

    const internalCredits = convertStripeGrantAmountToCredits(
      amountInCents,
      centsPerCredit
    )

    if (internalCredits <= 0 && amountInCents > 0) {
      logger.warn(
        {
          userId,
          grantId: grant.id,
          amountInCents,
          centsPerCredit,
          internalCredits,
        },
        'Calculated zero or negative internal credits from a positive Stripe grant amount.'
      )
    }

    logger.debug(
      {
        userId,
        grantId: grant.id,
        amountInCents,
        centsPerCredit,
        internalCredits,
      },
      'Converted Stripe grant to internal credits'
    )

    await db
      .insert(schema.creditGrants)
      .values({
        operation_id: grant.id,
        user_id: userId,
        amount: internalCredits,
        type: grantType,
        description: description,
        priority: priority,
        expires_at: expiresAt,
        created_at: new Date(grant.created * 1000),
        stripe_grant_id: grant.id,
      })
      .onConflictDoNothing()

    logger.info(
      { userId: userId, grantId: grant.id, creditsAdded: internalCredits },
      'Credit grant successfully inserted/ignored in DB via webhook'
    )
  } catch (error) {
    logger.error(
      { userId: userId, grantId: grant.id, error },
      'Error processing credit grant creation in handleCreditGrantCreated'
    )
    throw error
  }
}

async function handleCreditGrantUpdated(grant: Stripe.Billing.CreditGrant) {
  const userId = grant.metadata?.user_id
  if (!userId) {
    logger.error(
      { grantId: grant.id, metadata: grant.metadata },
      'Missing user_id in metadata for credit grant updated event'
    )
    return
  }

  const customerId = getCustomerId(grant.customer)

  const expiresAt = grant.expires_at ? new Date(grant.expires_at * 1000) : null
  const description = grant.metadata?.description || `Stripe Grant ${grant.id}`

  logger.info(
    { userId: userId, grantId: grant.id, customerId: customerId },
    'Processing credit grant update'
  )

  try {
    const result = await db
      .update(schema.creditGrants)
      .set({
        expires_at: expiresAt,
        description: description,
      })
      .where(eq(schema.creditGrants.stripe_grant_id, grant.id))

    if (result.rowCount && result.rowCount > 0) {
      logger.info(
        { userId: userId, grantId: grant.id },
        'Credit grant successfully updated in DB'
      )
    } else {
      logger.warn(
        { userId: userId, grantId: grant.id },
        'Credit grant update webhook received, but no matching grant found in DB'
      )
    }
  } catch (error) {
    logger.error(
      { userId: userId, grantId: grant.id, error },
      'Error updating credit grant in DB'
    )
    throw error
  }
}

export { webhookHandler as POST }
