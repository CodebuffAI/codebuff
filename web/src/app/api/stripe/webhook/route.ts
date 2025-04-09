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
import { GRANT_PRIORITIES } from 'common/src/constants/grant-priorities'
import { processAndGrantCredit } from 'common/src/billing/grant-credits'

async function handleCreditGrantCreated(grant: Stripe.Billing.CreditGrant) {
  const operationId = grant.metadata?.local_operation_id ?? grant.id
  const grantType = (grant.metadata?.type as GrantType | undefined) ?? 'free'
  const priority = parseInt(
    grant.metadata?.priority ?? GRANT_PRIORITIES[grantType].toString()
  )

  try {
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

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const sessionId = session.id;
    const metadata = session.metadata;

    // Check if this session was for a credit purchase
    if (metadata?.grantType === 'purchase' && metadata?.userId && metadata?.credits && metadata?.operationId) {
        const userId = metadata.userId;
        const credits = parseInt(metadata.credits, 10);
        const operationId = metadata.operationId;
        const paymentStatus = session.payment_status;

        if (paymentStatus === 'paid') {
            logger.info({ sessionId, userId, credits, operationId }, "Checkout session completed and paid for credit purchase.");

            // Grant the credits using the helper function
            // This creates the local grant immediately.
            // It will also attempt to create a Stripe grant, which might be redundant
            // if the purchase itself is considered the "source" by Stripe.
            // We set createStripeGrant to false IF Stripe automatically creates grants for payments,
            // otherwise true is fine and the webhook will reconcile later if needed.
            // Let's assume for now we *don't* need a separate Stripe Grant for a direct purchase payment.
            // If issues arise, we can change createStripeGrant to true.
            await processAndGrantCredit(
                userId,
                credits,
                'purchase',
                `Purchased ${credits.toLocaleString()} credits via checkout session ${sessionId}`,
                null, // Purchases don't expire
                operationId,
                false // Set to false assuming payment itself is the source, not requiring a separate Grant object
            );

        } else {
            logger.warn({ sessionId, userId, credits, operationId, paymentStatus }, "Checkout session completed but payment status is not 'paid'. No credits granted.");
        }
    } else {
        // Handle other types of checkout sessions if necessary
        logger.info({ sessionId, metadata }, "Checkout session completed for non-credit purchase or missing metadata.");
    }
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
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        )
        break
      }
      case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          // Check if it's an auto-topup invoice based on metadata or description
          if (invoice.metadata?.type === 'auto-topup' && invoice.billing_reason === 'manual') { // Manual invoices created by our backend
              const userId = invoice.metadata?.userId;
              const customerId = invoice.customer as string;

              if (userId && customerId && invoice.amount_paid > 0) {
                  // Calculate credits from amount paid - requires fetching the invoice items
                  // or relying on metadata if we stored credits there.
                  // Fetching items is more robust.
                  const invoiceItems = await stripeServer.invoiceItems.list({ invoice: invoice.id });
                  let creditsToGrant = 0;
                  for (const item of invoiceItems.data) {
                      if (item.metadata?.credits) {
                          creditsToGrant += parseInt(item.metadata.credits, 10);
                      } else {
                          // Fallback: calculate from amount if no metadata (less precise)
                          const centsPerCredit = await getUserCostPerCredit(userId);
                          creditsToGrant += convertStripeGrantAmountToCredits(item.amount, centsPerCredit);
                      }
                  }

                  if (creditsToGrant > 0) {
                      const operationId = `invpaid-${userId}-${invoice.id}`;
                      logger.info({ invoiceId: invoice.id, userId, credits: creditsToGrant, operationId }, "Invoice paid event for auto-topup.");
                       await processAndGrantCredit(
                           userId,
                           creditsToGrant,
                           'purchase',
                           `Automatic top-up via invoice ${invoice.id}`,
                           null,
                           operationId,
                           false // Assume payment is the source, no separate Stripe Grant needed
                       );
                  } else {
                       logger.warn({ invoiceId: invoice.id, userId }, "Invoice paid for auto-topup, but calculated 0 credits to grant.");
                  }
              } else {
                   logger.warn({ invoiceId: invoice.id, metadata: invoice.metadata }, "Invoice paid event received, but missing userId or customerId in metadata or amount paid is zero.");
              }
          }
          break;
      }
      case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
           // Check if it's an auto-topup invoice
           if (invoice.metadata?.type === 'auto-topup' && invoice.billing_reason === 'manual') {
               const userId = invoice.metadata?.userId;
               if (userId) {
                   logger.warn({ invoiceId: invoice.id, userId }, `Invoice payment failed for auto-topup. Disabling setting for user ${userId}.`);
                   // Disable auto-topup in DB
                   await db
                       .update(schema.user)
                       .set({ auto_topup_enabled: false })
                       .where(eq(schema.user.id, userId));
                   // TODO: Notify user via WebSocket or email
               }
           }
           break;
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
