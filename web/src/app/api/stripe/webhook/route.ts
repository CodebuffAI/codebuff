import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'

import { env } from '@/env.mjs'
import { stripeServer } from '@codebuff/common/util/stripe'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { logger } from '@/util/logger'
import { convertStripeGrantAmountToCredits } from 'common/util/currency'
import {
  getUserCostPerCredit,
  processAndGrantCredit,
  revokeGrantByOperationId,
  grantOrganizationCredits,
} from '@codebuff/billing'
import { getStripeCustomerId } from '@/lib/stripe-utils'

async function handleCustomerCreated(customer: Stripe.Customer) {
  logger.info({ customerId: customer.id }, 'New customer created')
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  const sessionId = session.id
  const metadata = session.metadata
  const organizationId = metadata?.organization_id

  logger.debug(
    { sessionId, metadata },
    'Entering handleCheckoutSessionCompleted'
  )

  // Handle subscription setup completion
  if (
    organizationId &&
    session.subscription &&
    typeof session.subscription === 'string'
  ) {
    logger.debug(
      { sessionId, subscriptionId: session.subscription },
      'Updating organization with subscription ID'
    )
    // Update organization with subscription ID and enable auto top-up by default
    await db
      .update(schema.org)
      .set({
        stripe_subscription_id: session.subscription,
        auto_topup_enabled: true,
        auto_topup_threshold: 500, // Default threshold: 500 credits
        auto_topup_amount: 2000,   // Default amount: 2000 credits ($20)
        updated_at: new Date(),
      })
      .where(eq(schema.org.id, organizationId))

    logger.info(
      { sessionId, organizationId, subscriptionId: session.subscription },
      'Enabled auto top-up by default for new organization subscription'
    )

    // Set the first payment method as default if available
    if (session.customer && typeof session.customer === 'string') {
      try {
        logger.debug(
          { sessionId, customerId: session.customer },
          'Checking for payment methods to set as default'
        )

        const paymentMethods = await stripeServer.paymentMethods.list({
          customer: session.customer,
        })

        if (paymentMethods.data.length > 0) {
          const firstPaymentMethod = paymentMethods.data[0]

          logger.debug(
            { sessionId, paymentMethodId: firstPaymentMethod.id },
            'Setting first payment method as default for organization'
          )

          await stripeServer.customers.update(session.customer, {
            invoice_settings: {
              default_payment_method: firstPaymentMethod.id,
            },
          })

          logger.info(
            {
              sessionId,
              organizationId,
              customerId: session.customer,
              paymentMethodId: firstPaymentMethod.id,
              subscriptionId: session.subscription,
            },
            'Successfully set first payment method as default for organization subscription'
          )
        } else {
          logger.warn(
            { sessionId, organizationId, customerId: session.customer },
            'No payment methods found for organization customer'
          )
        }
      } catch (paymentMethodError) {
        logger.warn(
          { sessionId, organizationId, error: paymentMethodError },
          'Failed to set default payment method for organization subscription, but subscription was created'
        )
      }
    } else {
      logger.warn(
        { sessionId, organizationId, subscriptionId: session.subscription },
        'No customer ID found in subscription checkout session'
      )
    }

    logger.info(
      {
        sessionId,
        organizationId,
        customerId: session.customer,
        subscriptionId: session.subscription,
      },
      'Successfully set up subscription for organization'
    )
  } else {
    logger.warn(
      { sessionId },
      'No subscription ID found in session for subscription_setup'
    )
  }

  // Handle user credit purchases
  if (
    metadata?.grantType === 'purchase' &&
    metadata?.userId &&
    metadata?.credits &&
    metadata?.operationId
  ) {
    logger.debug({ sessionId, metadata }, 'Handling user credit purchase')
    const userId = metadata.userId
    const credits = parseInt(metadata.credits, 10)
    const operationId = metadata.operationId
    const paymentStatus = session.payment_status

    if (paymentStatus === 'paid') {
      logger.info(
        { sessionId, userId, credits, operationId },
        'Checkout session completed and paid for user credit purchase.'
      )

      await processAndGrantCredit(
        userId,
        credits,
        'purchase',
        `Purchased ${credits.toLocaleString()} credits via checkout session ${sessionId}`,
        null,
        operationId
      )
    } else {
      logger.warn(
        { sessionId, userId, credits, operationId, paymentStatus },
        "Checkout session completed but payment status is not 'paid'. No credits granted."
      )
    }
  }
  // Handle organization credit purchases
  else if (
    metadata?.grantType === 'organization_purchase' &&
    metadata?.organizationId &&
    metadata?.userId &&
    metadata?.credits &&
    metadata?.operationId
  ) {
    logger.debug(
      { sessionId, metadata },
      'Handling organization credit purchase'
    )
    const organizationId = metadata.organizationId
    const userId = metadata.userId
    const credits = parseInt(metadata.credits, 10)
    const operationId = metadata.operationId
    const paymentStatus = session.payment_status

    if (paymentStatus === 'paid') {
      logger.info(
        { sessionId, organizationId, userId, credits, operationId },
        'Checkout session completed and paid for organization credit purchase.'
      )

      await grantOrganizationCredits(
        organizationId,
        userId, // Pass the user who initiated the purchase
        credits,
        operationId,
        `Purchased ${credits.toLocaleString()} credits via checkout session ${sessionId}`
      )
    } else {
      logger.warn(
        {
          sessionId,
          organizationId,
          userId,
          credits,
          operationId,
          paymentStatus,
        },
        "Checkout session completed but payment status is not 'paid'. No organization credits granted."
      )
    }
  } else {
    logger.info(
      { sessionId, metadata },
      'Checkout session completed for non-credit purchase or missing metadata.'
    )
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

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // For regular (non-auto-topup) invoices, verify credit note exists
  const creditNotes = await stripeServer.creditNotes.list({
    invoice: invoice.id,
  })

  let customerId: string | null = null
  if (invoice.customer) {
    customerId = getStripeCustomerId(invoice.customer)
  }

  if (creditNotes.data.length > 0) {
    logger.info(
      {
        invoiceId: invoice.id,
        creditNoteIds: creditNotes.data.map((cn) => cn.id),
        customerId,
      },
      'Invoice paid with existing credit notes - no action needed'
    )
  } else {
    logger.warn(
      {
        invoiceId: invoice.id,
        customerId,
      },
      'Invoice paid but no credit notes found - this may indicate a missing credit note from draft stage'
    )
  }
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
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        // Get the payment intent ID from the charge
        const paymentIntentId = charge.payment_intent
        if (paymentIntentId) {
          // Get the payment intent to access its metadata
          const paymentIntent = await stripeServer.paymentIntents.retrieve(
            typeof paymentIntentId === 'string'
              ? paymentIntentId
              : paymentIntentId.toString()
          )

          if (paymentIntent.metadata?.operationId) {
            const operationId = paymentIntent.metadata.operationId
            logger.info(
              { chargeId: charge.id, paymentIntentId, operationId },
              'Processing refund, attempting to revoke credits'
            )

            const revoked = await revokeGrantByOperationId(
              operationId,
              `Refund for charge ${charge.id}`
            )

            if (!revoked) {
              logger.error(
                { chargeId: charge.id, operationId },
                'Failed to revoke credits for refund - grant may not exist or credits already spent'
              )
            }
          } else {
            logger.warn(
              { chargeId: charge.id, paymentIntentId },
              'Refund received but no operation ID found in payment intent metadata'
            )
          }
        }
        break
      }
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        )
        break
      }
      case 'invoice.paid': {
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (
          invoice.metadata?.type === 'auto-topup' &&
          invoice.billing_reason === 'manual'
        ) {
          const userId = invoice.metadata?.userId
          if (userId) {
            logger.warn(
              { invoiceId: invoice.id, userId },
              `Invoice payment failed for auto-topup. Disabling setting for user ${userId}.`
            )
            await db
              .update(schema.user)
              .set({ auto_topup_enabled: false })
              .where(eq(schema.user.id, userId))
          }
        }
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
