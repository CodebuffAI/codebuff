import {
  grantOrganizationCredits,
  processAndGrantCredit,
  revokeGrantByOperationId,
  handleSubscriptionInvoicePaid,
  handleSubscriptionInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleSubscriptionScheduleCreatedOrUpdated,
  handleSubscriptionScheduleReleasedOrCanceled,
} from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { sendDisputeNotificationEmail } from '@codebuff/internal/loops'
import { getStripeId, stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'

import {
  banUser,
  evaluateBanConditions,
  getUserByStripeCustomerId,
} from '@/lib/ban-conditions'
import { ORG_BILLING_ENABLED } from '@/lib/billing-config'
import { logger } from '@/util/logger'
import { isOrgBillingEvent, isOrgCustomer } from './_helpers'

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const sessionId = session.id
  const metadata = session.metadata
  const organizationId = metadata?.organization_id

  logger.debug(
    { sessionId, metadata },
    'Entering handleCheckoutSessionCompleted',
  )

  // Handle subscription setup completion
  if (
    organizationId &&
    session.subscription &&
    typeof session.subscription === 'string'
  ) {
    logger.debug(
      { sessionId, subscriptionId: session.subscription },
      'Updating organization with subscription ID',
    )
    // Update organization with subscription ID and enable auto top-up by default
    await db
      .update(schema.org)
      .set({
        stripe_subscription_id: session.subscription,
        auto_topup_enabled: true,
        auto_topup_threshold: 500, // Default threshold: 500 credits
        auto_topup_amount: 2000, // Default amount: 2000 credits ($20)
        updated_at: new Date(),
      })
      .where(eq(schema.org.id, organizationId))

    logger.info(
      { sessionId, organizationId, subscriptionId: session.subscription },
      'Enabled auto top-up by default for new organization subscription',
    )

    // Set the first payment method as default if available
    if (session.customer && typeof session.customer === 'string') {
      try {
        logger.debug(
          { sessionId, customerId: session.customer },
          'Checking for payment methods to set as default',
        )

        const paymentMethods = await stripeServer.paymentMethods.list({
          customer: session.customer,
        })

        if (paymentMethods.data.length > 0) {
          const firstPaymentMethod = paymentMethods.data[0]

          logger.debug(
            { sessionId, paymentMethodId: firstPaymentMethod.id },
            'Setting first payment method as default for organization',
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
            'Successfully set first payment method as default for organization subscription',
          )
        } else {
          logger.warn(
            { sessionId, organizationId, customerId: session.customer },
            'No payment methods found for organization customer',
          )
        }
      } catch (paymentMethodError) {
        logger.warn(
          { sessionId, organizationId, error: paymentMethodError },
          'Failed to set default payment method for organization subscription, but subscription was created',
        )
      }
    } else {
      logger.warn(
        { sessionId, organizationId, subscriptionId: session.subscription },
        'No customer ID found in subscription checkout session',
      )
    }

    logger.info(
      {
        sessionId,
        organizationId,
        customerId: session.customer,
        subscriptionId: session.subscription,
      },
      'Successfully set up subscription for organization',
    )
  } else {
    logger.warn(
      { sessionId },
      'No subscription ID found in session for subscription_setup',
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
        'Checkout session completed and paid for user credit purchase.',
      )

      await processAndGrantCredit({
        userId,
        amount: credits,
        type: 'purchase',
        description: `Purchased ${credits.toLocaleString()} credits via checkout session ${sessionId}`,
        expiresAt: null,
        operationId,
        logger,
      })
    } else {
      logger.warn(
        { sessionId, userId, credits, operationId, paymentStatus },
        "Checkout session completed but payment status is not 'paid'. No credits granted.",
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
      'Handling organization credit purchase',
    )
    const organizationId = metadata.organizationId
    const userId = metadata.userId
    const credits = parseInt(metadata.credits, 10)
    const operationId = metadata.operationId
    const paymentStatus = session.payment_status

    if (paymentStatus === 'paid') {
      logger.info(
        { sessionId, organizationId, userId, credits, operationId },
        'Checkout session completed and paid for organization credit purchase.',
      )

      await grantOrganizationCredits({
        organizationId,
        userId, // Pass the user who initiated the purchase
        amount: credits,
        operationId,
        description: `Purchased ${credits.toLocaleString()} credits via checkout session ${sessionId}`,
        logger,
      })
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
        "Checkout session completed but payment status is not 'paid'. No organization credits granted.",
      )
    }
  } else {
    logger.info(
      { sessionId, metadata },
      'Checkout session completed for non-credit purchase or missing metadata.',
    )
  }
}

async function handleOrganizationSubscriptionEvent(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organization_id
  if (!organizationId) {
    logger.warn(
      { subscriptionId: subscription.id },
      'Organization subscription event missing organization_id metadata',
    )
    return
  }

  logger.info(
    {
      subscriptionId: subscription.id,
      status: subscription.status,
      customerId: subscription.customer,
      organizationId,
    },
    'Organization subscription event received',
  )

  try {
    // Handle subscription cancellation
    if (subscription.status === 'canceled') {
      await db
        .update(schema.org)
        .set({
          stripe_subscription_id: null,
          auto_topup_enabled: false,
          updated_at: new Date(),
        })
        .where(eq(schema.org.id, organizationId))

      logger.info(
        { subscriptionId: subscription.id, organizationId },
        'Updated organization after subscription cancellation',
      )
    }
    // Handle subscription updates (status changes, etc.)
    else if (
      subscription.status === 'active' ||
      subscription.status === 'past_due'
    ) {
      // Ensure organization has the subscription ID set
      const org = await db
        .select({ stripe_subscription_id: schema.org.stripe_subscription_id })
        .from(schema.org)
        .where(eq(schema.org.id, organizationId))
        .limit(1)

      if (org.length > 0 && !org[0].stripe_subscription_id) {
        await db
          .update(schema.org)
          .set({
            stripe_subscription_id: subscription.id,
            updated_at: new Date(),
          })
          .where(eq(schema.org.id, organizationId))

        logger.info(
          { subscriptionId: subscription.id, organizationId },
          'Updated organization with subscription ID',
        )
      }
    }
  } catch (error) {
    logger.error(
      { subscriptionId: subscription.id, organizationId, error },
      'Failed to handle subscription event',
    )
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // For regular (non-auto-topup) invoices, verify credit note exists
  const creditNotes = await stripeServer.creditNotes.list({
    invoice: invoice.id,
  })

  let customerId: string | null = null
  if (invoice.customer) {
    customerId = getStripeId(invoice.customer)
  }

  if (creditNotes.data.length > 0) {
    logger.info(
      {
        invoiceId: invoice.id,
        creditNoteIds: creditNotes.data.map((cn) => cn.id),
        customerId,
      },
      'Invoice paid with existing credit notes - no action needed',
    )
  } else {
    logger.warn(
      {
        invoiceId: invoice.id,
        customerId,
      },
      'Invoice paid but no credit notes found - this may indicate a missing credit note from draft stage',
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
      env.STRIPE_WEBHOOK_SECRET_KEY,
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(
      { error: errorMessage },
      'Webhook signature verification failed',
    )
    return NextResponse.json(
      { error: { message: `Webhook Error: ${errorMessage}` } },
      { status: 400 },
    )
  }

  logger.info({ type: event.type }, 'Received Stripe webhook event')

  // BILLING_DISABLED: Acknowledge but ignore org-billing related events
  // Return 200 to prevent Stripe from retrying (503 would cause retry storms)
  if (!ORG_BILLING_ENABLED) {
    const isOrgEvent = await isOrgBillingEvent(event)
    if (isOrgEvent) {
      logger.warn(
        { type: event.type, eventId: event.id },
        'BILLING_DISABLED: Ignoring org billing webhook event',
      )
      return NextResponse.json({
        received: true,
        ignored: 'org billing disabled',
      })
    }
  }

  try {
    switch (event.type) {
      case 'customer.created':
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        if (sub.metadata?.organization_id) {
          await handleOrganizationSubscriptionEvent(sub)
        } else {
          await handleSubscriptionUpdated({ stripeSubscription: sub, logger })
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        if (sub.metadata?.organization_id) {
          await handleOrganizationSubscriptionEvent(sub)
        } else {
          await handleSubscriptionDeleted({ stripeSubscription: sub, logger })
        }
        break
      }
      case 'subscription_schedule.created':
      case 'subscription_schedule.updated': {
        const schedule = event.data.object as Stripe.SubscriptionSchedule
        // Skip organization schedules (if they have org metadata)
        if (!schedule.metadata?.organization_id) {
          await handleSubscriptionScheduleCreatedOrUpdated({ schedule, logger })
        }
        break
      }
      case 'subscription_schedule.completed':
      case 'subscription_schedule.released':
      case 'subscription_schedule.canceled': {
        const schedule = event.data.object as Stripe.SubscriptionSchedule
        // Skip organization schedules (if they have org metadata)
        if (!schedule.metadata?.organization_id) {
          await handleSubscriptionScheduleReleasedOrCanceled({ schedule, logger })
        }
        break
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute

        if (!dispute.charge) {
          logger.warn(
            { disputeId: dispute.id },
            'Dispute received without charge ID',
          )
          break
        }
        const chargeId = getStripeId(dispute.charge)

        // Get the charge to find the customer
        const charge = await stripeServer.charges.retrieve(chargeId)
        if (!charge.customer) {
          logger.warn(
            { disputeId: dispute.id, chargeId },
            'Dispute charge has no customer (guest payment)',
          )
          break
        }

        const customerId = getStripeId(charge.customer)

        if (!customerId) {
          logger.warn(
            { disputeId: dispute.id, chargeId },
            'Dispute charge has no customer',
          )
          break
        }

        // Look up the user
        const user = await getUserByStripeCustomerId(customerId)
        if (!user) {
          logger.info(
            { disputeId: dispute.id, customerId },
            'Dispute received for unknown customer (may be an organization)',
          )
          break
        }

        // Skip if already banned
        if (user.banned) {
          logger.debug(
            { disputeId: dispute.id, userId: user.id },
            'Dispute received for already-banned user, skipping evaluation',
          )
          break
        }

        // Evaluate ban conditions
        const banResult = await evaluateBanConditions({
          userId: user.id,
          stripeCustomerId: customerId,
          logger,
        })

        if (banResult.shouldBan) {
          await banUser(user.id, banResult.reason, logger)
          logger.warn(
            {
              disputeId: dispute.id,
              userId: user.id,
              customerId,
              reason: banResult.reason,
            },
            'User auto-banned due to dispute threshold',
          )
          // Don't send email to banned users
        } else {
          // Send friendly dispute notification email to non-banned users
          const firstName = user.name?.split(' ')[0] || 'there'
          const disputeAmount = `$${(dispute.amount / 100).toFixed(2)}`
          const emailResult = await sendDisputeNotificationEmail({
            email: user.email,
            firstName,
            disputeAmount,
            logger,
          })

          if (emailResult.success) {
            logger.info(
              { disputeId: dispute.id, userId: user.id, email: user.email },
              'Sent dispute notification email to user',
            )
          } else {
            logger.warn(
              {
                disputeId: dispute.id,
                userId: user.id,
                email: user.email,
                error: emailResult.error,
              },
              'Failed to send dispute notification email',
            )
          }
        }
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        // Get the payment intent ID from the charge
        const paymentIntentId = charge.payment_intent
        if (paymentIntentId) {
          // Get the payment intent to access its metadata
          const paymentIntent = await stripeServer.paymentIntents.retrieve(
            typeof paymentIntentId === 'string'
              ? paymentIntentId
              : paymentIntentId.toString(),
          )

          if (paymentIntent.metadata?.operationId) {
            const operationId = paymentIntent.metadata.operationId
            logger.info(
              { chargeId: charge.id, paymentIntentId, operationId },
              'Processing refund, attempting to revoke credits',
            )

            const revoked = await revokeGrantByOperationId({
              operationId,
              reason: `Refund for charge ${charge.id}`,
              logger,
            })

            if (!revoked) {
              logger.error(
                { chargeId: charge.id, operationId },
                'Failed to revoke credits for refund - grant may not exist or credits already spent',
              )
            }
          } else {
            logger.warn(
              { chargeId: charge.id, paymentIntentId },
              'Refund received but no operation ID found in payment intent metadata',
            )
          }
        }
        break
      }
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        )
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.subscription) {
          if (!invoice.customer) {
            logger.warn(
              { invoiceId: invoice.id },
              'Subscription invoice has no customer — skipping',
            )
          } else {
            const customerId = getStripeId(invoice.customer)
            if (!(await isOrgCustomer(customerId))) {
              await handleSubscriptionInvoicePaid({ invoice, logger })
            }
          }
        } else {
          await handleInvoicePaid(invoice)
        }
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.subscription) {
          if (!invoice.customer) {
            logger.warn(
              { invoiceId: invoice.id },
              'Subscription invoice has no customer — skipping',
            )
          } else {
            const customerId = getStripeId(invoice.customer)
            if (!(await isOrgCustomer(customerId))) {
              await handleSubscriptionInvoicePaymentFailed({ invoice, logger })
            }
          }
        }
        if (
          invoice.metadata?.type === 'auto-topup' &&
          invoice.billing_reason === 'manual'
        ) {
          const userId = invoice.metadata?.userId
          const organizationId = invoice.metadata?.organizationId

          if (userId) {
            logger.warn(
              { invoiceId: invoice.id, userId },
              `Invoice payment failed for user auto-topup. Disabling setting for user ${userId}.`,
            )
            await db
              .update(schema.user)
              .set({ auto_topup_enabled: false })
              .where(eq(schema.user.id, userId))
          } else if (organizationId) {
            logger.warn(
              { invoiceId: invoice.id, organizationId },
              `Invoice payment failed for organization auto-topup. Disabling setting for organization ${organizationId}.`,
            )
            await db
              .update(schema.org)
              .set({ auto_topup_enabled: false })
              .where(eq(schema.org.id, organizationId))
          }
        }
        break
      }
      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe event type')
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(
      { error: errorMessage, eventType: event.type },
      'Error processing webhook',
    )
    return NextResponse.json(
      { error: { message: `Webhook handler error: ${errorMessage}` } },
      { status: 500 },
    )
  }
}

export { webhookHandler as POST }
