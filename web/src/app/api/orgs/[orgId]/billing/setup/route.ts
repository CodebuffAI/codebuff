import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { eq, and } from 'drizzle-orm'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import { stripeServer } from 'common/src/util/stripe'
import { env } from '@/env.mjs'

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
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { role, organization } = membership[0]

    // Check if user has permission to manage billing
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if billing is already set up
    let isSetup = false
    if (organization.stripe_customer_id) {
      try {
        const paymentMethods = await stripeServer.paymentMethods.list({
          customer: organization.stripe_customer_id,
          type: 'card',
        })
        isSetup = paymentMethods.data.length > 0
      } catch (error) {
        logger.warn({ orgId, error }, 'Failed to check existing payment methods')
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
    logger.error({ error: error.message, orgId }, 'Failed to get billing setup status')
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
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { role, organization } = membership[0]

    // Check if user has permission to setup billing
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    let stripeCustomerId = organization.stripe_customer_id

    // Create Stripe customer if it doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripeServer.customers.create({
        name: organization.name,
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

    // Create Stripe Checkout session in setup mode
    const checkoutSession = await stripeServer.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.id}?billing_setup=success`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/orgs/${organization.id}/billing/setup?canceled=true`,
      metadata: {
        organization_id: orgId,
        type: 'billing_setup',
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
      { orgId, sessionId: checkoutSession.id },
      'Created Stripe checkout session for billing setup'
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
