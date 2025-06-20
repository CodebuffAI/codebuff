import { getServerSession } from 'next-auth'
import { eq, and, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { env } from '@codebuff/internal'
import { logger } from '@/util/logger'
import { stripeServer } from '@codebuff/common/util/stripe'
import { pluralize } from '@codebuff/common/util/string'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'

interface RouteParams {
  params: {
    orgId: string
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = params

  try {
    // Check if user has access to this organization
    const membership = await db
      .select({
        role: schema.orgMember.role,
        organization: schema.org,
      })
      .from(schema.orgMember)
      .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const { role, organization } = membership[0]

    // Check if user has permission to manage billing
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if billing is already set up
    let isSetup = false
    if (organization.stripe_customer_id) {
      try {
        const [cardPaymentMethods, linkPaymentMethods] = await Promise.all([
          stripeServer.paymentMethods.list({
            customer: organization.stripe_customer_id,
            type: 'card',
          }),
          stripeServer.paymentMethods.list({
            customer: organization.stripe_customer_id,
            type: 'link',
          }),
        ])
        isSetup =
          cardPaymentMethods.data.length > 0 ||
          linkPaymentMethods.data.length > 0
      } catch (error) {
        logger.warn(
          { orgId, error },
          'Failed to check existing payment methods'
        )
      }
    }

    return NextResponse.json({
      is_setup: isSetup,
      organization: {
        id: organization.id,
        name: organization.name,
      },
    })
  } catch (error: any) {
    logger.error(
      { error: error.message, orgId },
      'Failed to get billing setup status'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = params

  try {
    // Check if user has access to this organization and get org details
    const membership = await db
      .select({
        role: schema.orgMember.role,
        organization: schema.org,
      })
      .from(schema.orgMember)
      .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const { role, organization } = membership[0]

    // Check if user has permission to setup billing
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Get member count for the organization
    const memberCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orgMember)
      .where(eq(schema.orgMember.org_id, orgId))

    const seatCount = Math.max(1, memberCount[0].count) // Minimum 1 seat

    let stripeCustomerId = organization.stripe_customer_id

    // Create Stripe customer if it doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripeServer.customers.create({
        name: organization.name,
        email: session.user.email || undefined,
        metadata: {
          organization_id: orgId,
          type: 'organization',
        },
      })

      stripeCustomerId = customer.id

      // Update organization with Stripe customer ID
      await db
        .update(schema.org)
        .set({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date(),
        })
        .where(eq(schema.org.id, orgId))

      logger.info(
        { orgId, stripeCustomerId },
        'Created Stripe customer for organization'
      )
    }

    // Create Stripe Checkout session for subscription
    const checkoutSession = await stripeServer.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [
        {
          price: env.STRIPE_TEAM_FEE_PRICE_ID,
          quantity: seatCount,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.slug}/billing/purchase?subscription_success=true`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.slug}?subscription_canceled=true`,
      metadata: {
        organization_id: orgId,
        type: 'subscription_setup',
      },
      subscription_data: {
        description: `Team subscription for ${organization.name} - Monthly billing for ${pluralize(seatCount, 'seat')}. You will be charged for each member of your organization. Add or remove team members anytime and your billing will adjust automatically.`,
        metadata: {
          organization_id: orgId,
        },
      },
      custom_text: {
        submit: {
          message: `You're subscribing to a team plan with ${pluralize(seatCount, 'seat')}. Your billing will automatically adjust when you add or remove team members.`,
        },
      },
    })

    if (!checkoutSession.url) {
      logger.error({ orgId }, 'Stripe checkout session created without a URL')
      return NextResponse.json(
        { error: 'Could not create Stripe checkout session' },
        { status: 500 }
      )
    }

    logger.info(
      { orgId, sessionId: checkoutSession.id, seatCount },
      'Created Stripe checkout session for billing setup with seat-based pricing'
    )

    return NextResponse.json({ sessionId: checkoutSession.id })
  } catch (error: any) {
    logger.error(
      { error: error.message, orgId },
      'Failed to create billing setup session'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
