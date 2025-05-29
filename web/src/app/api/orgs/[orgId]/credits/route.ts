import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { stripeServer } from 'common/util/stripe'
import { env } from 'common/src/env.mjs'
import { CREDIT_PRICING } from 'common/src/constants'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = params

  try {
    const body = await request.json()
    const { amount: credits } = body // Frontend sends 'amount' which is actually credits

    if (!credits || credits < CREDIT_PRICING.MIN_PURCHASE_CREDITS) {
      return NextResponse.json(
        {
          error: `Minimum purchase is ${CREDIT_PRICING.MIN_PURCHASE_CREDITS} credits`,
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

    // Create subscription if it doesn't exist yet
    if (!organization.stripe_subscription_id) {
      try {
        const subscription = await stripeServer.subscriptions.create({
          customer: organization.stripe_customer_id,
          items: [
            {
              price: env.STRIPE_TEAM_USAGE_PRICE_ID,
            },
            {
              price: env.STRIPE_USAGE_PRICE_ID,
            },
          ],
          metadata: {
            organization_id: orgId,
            type: 'team_subscription',
          },
        })

        // Update organization with subscription ID
        await db
          .update(schema.org)
          .set({
            stripe_subscription_id: subscription.id,
            updated_at: new Date(),
          })
          .where(eq(schema.org.id, orgId))

        logger.info(
          {
            organizationId: orgId,
            subscriptionId: subscription.id,
          },
          'Created Stripe subscription for organization on first credit purchase'
        )
      } catch (error) {
        logger.error(
          { organizationId: orgId, error },
          'Failed to create Stripe subscription for organization'
        )
        return NextResponse.json(
          {
            error: 'Failed to setup subscription. Please try again.',
          },
          { status: 500 }
        )
      }
    }

    const amountInCents = credits * CREDIT_PRICING.CENTS_PER_CREDIT

    // Create Stripe Checkout session for credit purchase
    const successUrl = `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.slug}/billing/purchase?purchase_success=true`
    const cancelUrl = `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.slug}/billing/purchase?purchase_canceled=true`

    const checkoutSession = await stripeServer.checkout.sessions.create({
      payment_method_types: ['card'],
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
        credits: credits.toString(),
        operationId: `org-${orgId}-${Date.now()}`, // Add operation ID
        grantType: 'organization_purchase', // Change from 'type' to 'grantType'
        type: 'credit_purchase', // Keep this for backward compatibility
      },
    })

    return NextResponse.json({
      success: true,
      checkout_url: checkoutSession.url,
      credits: credits,
      amount_cents: amountInCents,
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
