import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { stripeServer } from 'common/util/stripe'
import { env } from '@/env'
import { CREDIT_PRICING } from 'common/src/constants'
import { logger } from '@/util/logger'
import { generateCompactId } from 'common/src/util/string'
import { grantOrganizationCredits } from '@codebuff/billing'

interface RouteParams {
  params: { orgId: string }
}

const ORG_MIN_PURCHASE_CREDITS = 5000 // $50 minimum for organizations

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = params

  try {
    const body = await request.json()
    const { amount: credits } = body // Frontend sends 'amount' which is actually credits

    if (!credits || credits < ORG_MIN_PURCHASE_CREDITS) {
      return NextResponse.json(
        {
          error: `Minimum purchase is ${ORG_MIN_PURCHASE_CREDITS.toLocaleString()} credits`,
        },
        { status: 400 }
      )
    }

    // Verify user has permission to purchase credits for this organization
    const membership = await db.query.orgMember.findFirst({
      where: and(
        eq(schema.orgMember.org_id, orgId),
        eq(schema.orgMember.user_id, session.user.id),
        // Only owners can purchase credits for now
        eq(schema.orgMember.role, 'owner')
      ),
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden or Organization not found' },
        { status: 403 }
      )
    }

    const organization = await db.query.org.findFirst({
      where: eq(schema.org.id, orgId),
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    if (!organization.stripe_customer_id) {
      return NextResponse.json(
        {
          error:
            'Organization billing not set up. Please set up billing first.',
        },
        { status: 400 }
      )
    }

    // Check if subscription exists (should exist after billing setup)
    if (!organization.stripe_subscription_id) {
      return NextResponse.json(
        {
          error:
            'Organization subscription not found. Please set up billing first.',
        },
        { status: 400 }
      )
    }

    const amountInCents = credits * CREDIT_PRICING.CENTS_PER_CREDIT
    const operationId = `org-${orgId}-${generateCompactId()}`

    // Get customer's default payment method
    const customer = await stripeServer.customers.retrieve(organization.stripe_customer_id)
    
    // Check if customer is not deleted and has invoice settings
    let defaultPaymentMethodId = !('deleted' in customer) 
      ? customer.invoice_settings?.default_payment_method as string | null 
      : null

    // If no default payment method is set, check if there's exactly one card on file
    if (!defaultPaymentMethodId) {
      try {
        const paymentMethods = await stripeServer.paymentMethods.list({
          customer: organization.stripe_customer_id,
          type: 'card',
        })

        // If there's exactly one card, set it as the default
        if (paymentMethods.data.length === 1) {
          const singleCard = paymentMethods.data[0]
          
          // Check if the card is valid (not expired)
          const isValid = singleCard.card?.exp_year &&
            singleCard.card.exp_month &&
            new Date(singleCard.card.exp_year, singleCard.card.exp_month - 1) > new Date()

          if (isValid) {
            await stripeServer.customers.update(organization.stripe_customer_id, {
              invoice_settings: {
                default_payment_method: singleCard.id,
              },
            })

            defaultPaymentMethodId = singleCard.id

            logger.info(
              { organizationId: orgId, paymentMethodId: singleCard.id },
              'Automatically set single valid card as default payment method for organization'
            )
          }
        }
      } catch (error: any) {
        logger.warn(
          { organizationId: orgId, error: error.message },
          'Failed to check or set default payment method for organization'
        )
        // Continue without setting default - will fall back to checkout
      }
    }

    // If we have a default payment method, try to use it first
    if (defaultPaymentMethodId) {
      try {
        const paymentMethod = await stripeServer.paymentMethods.retrieve(defaultPaymentMethodId)
        
        // Check if payment method is valid (not expired for cards)
        const isValid = paymentMethod.type === 'link' || (
          paymentMethod.type === 'card' &&
          paymentMethod.card?.exp_year &&
          paymentMethod.card.exp_month &&
          new Date(paymentMethod.card.exp_year, paymentMethod.card.exp_month - 1) > new Date()
        )

        if (isValid) {
          const paymentIntent = await stripeServer.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd',
            customer: organization.stripe_customer_id,
            payment_method: defaultPaymentMethodId,
            off_session: true,
            confirm: true,
            description: `${credits.toLocaleString()} credits for ${organization.name}`,
            metadata: {
              organizationId: orgId,
              organization_id: orgId, // Add this for consistency with webhook
              userId: session.user.id, // Add the user who initiated the purchase
              credits: credits.toString(),
              operationId,
              grantType: 'organization_purchase',
            },
          })

          if (paymentIntent.status === 'succeeded') {
            // Grant credits immediately
            await grantOrganizationCredits(
              orgId,
              session.user.id, // Pass the user who initiated the purchase
              credits,
              operationId,
              `Direct purchase of ${credits.toLocaleString()} credits`
            )

            logger.info(
              { organizationId: orgId, userId: session.user.id, credits, operationId, paymentIntentId: paymentIntent.id },
              'Successfully processed direct organization credit purchase'
            )

            return NextResponse.json({ 
              success: true, 
              credits,
              direct_charge: true 
            })
          }
        }
      } catch (error: any) {
        // If direct charge fails, fall back to checkout
        logger.warn(
          { organizationId: orgId, userId: session.user.id, operationId, error: error.message, errorCode: error.code },
          'Direct charge failed for organization, falling back to checkout'
        )
      }
    }

    // Fall back to checkout session if direct charge failed or no valid payment method
    const successUrl = `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.slug}?purchase_success=true`
    const cancelUrl = `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.slug}?purchase_canceled=true`

    const checkoutSession = await stripeServer.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      mode: 'payment',
      customer: organization.stripe_customer_id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits.toLocaleString()} Codebuff Credits`,
              description: `Credits for ${organization.name} (${CREDIT_PRICING.DISPLAY_RATE})`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        organization_id: orgId,
        organizationId: orgId, // Add this for consistency with webhook
        userId: session.user.id, // Add the user who initiated the purchase
        credits: credits.toString(),
        operationId: operationId,
        grantType: 'organization_purchase', // Change from 'type' to 'grantType'
        type: 'credit_purchase', // Keep this for backward compatibility
      },
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          organization_id: orgId,
          organizationId: orgId,
          userId: session.user.id, // Add the user who initiated the purchase
          credits: credits.toString(),
          operationId: operationId,
          grantType: 'organization_purchase',
        },
      },
    })

    if (!checkoutSession.url) {
      logger.error(
        { organizationId: orgId, userId: session.user.id, credits },
        'Stripe checkout session created without a URL.'
      )
      return NextResponse.json(
        { error: 'Could not create Stripe checkout session.' },
        { status: 500 }
      )
    }

    logger.info(
      { organizationId: orgId, userId: session.user.id, credits, operationId, sessionId: checkoutSession.id },
      'Created Stripe checkout session for organization credit purchase'
    )

    return NextResponse.json({
      success: true,
      checkout_url: checkoutSession.url,
      credits: credits,
      amount_cents: amountInCents,
      direct_charge: false
    })
  } catch (error) {
    console.error('Error creating credit purchase session:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      {
        error: 'Failed to create credit purchase session',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}
