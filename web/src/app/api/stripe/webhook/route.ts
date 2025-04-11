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
import { GrantType } from 'common/types/grant'
import { GRANT_PRIORITIES } from 'common/src/constants/grant-priorities'
import { processAndGrantCredit } from 'common/src/billing/grant-credits'

async function handleCustomerCreated(customer: Stripe.Customer) {
  logger.info({ customerId: customer.id }, 'New customer created')
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const sessionId = session.id;
    const metadata = session.metadata;

    if (metadata?.grantType === 'purchase' && metadata?.userId && metadata?.credits && metadata?.operationId) {
        const userId = metadata.userId;
        const credits = parseInt(metadata.credits, 10);
        const operationId = metadata.operationId;
        const paymentStatus = session.payment_status;

        if (paymentStatus === 'paid') {
            logger.info({ sessionId, userId, credits, operationId }, "Checkout session completed and paid for credit purchase.");

            await processAndGrantCredit(
                userId,
                credits,
                'purchase',
                `Purchased ${credits.toLocaleString()} credits via checkout session ${sessionId}`,
                null,
                operationId
            );

        } else {
            logger.warn({ sessionId, userId, credits, operationId, paymentStatus }, "Checkout session completed but payment status is not 'paid'. No credits granted.");
        }
    } else {
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
        break
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        )
        break
      }
      case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.metadata?.type === 'auto-topup' && invoice.billing_reason === 'manual') {
              const userId = invoice.metadata?.userId;
              const customerId = invoice.customer as string;

              if (userId && customerId && invoice.amount_paid > 0) {
                  const invoiceItems = await stripeServer.invoiceItems.list({ invoice: invoice.id });
                  let creditsToGrant = 0;
                  for (const item of invoiceItems.data) {
                      if (item.metadata?.credits) {
                          creditsToGrant += parseInt(item.metadata.credits, 10);
                      } else {
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
                           operationId
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
           if (invoice.metadata?.type === 'auto-topup' && invoice.billing_reason === 'manual') {
               const userId = invoice.metadata?.userId;
               if (userId) {
                   logger.warn({ invoiceId: invoice.id, userId }, `Invoice payment failed for auto-topup. Disabling setting for user ${userId}.`);
                   await db
                       .update(schema.user)
                       .set({ auto_topup_enabled: false })
                       .where(eq(schema.user.id, userId));
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
