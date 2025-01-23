import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/env.mjs'
import db from 'common/src/db'
import * as schema from 'common/src/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { organizationId, priceId } = body

    if (!organizationId || !priceId) {
      return NextResponse.json(
        { error: 'Organization ID and price ID are required' },
        { status: 400 }
      )
    }

    // Verify user is admin of the organization
    const membership = await db
      .select()
      .from(schema.organization_member)
      .where(
        and(
          eq(schema.organization_member.organization_id, organizationId),
          eq(schema.organization_member.user_id, session.user.id || ''),
          eq(schema.organization_member.role, 'admin')
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json(
        { error: 'Unauthorized - must be organization admin' },
        { status: 403 }
      )
    }

    // Get organization
    const organization = await db.query.organization.findFirst({
      where: eq(schema.organization.id, organizationId),
      columns: {
        stripe_customer_id: true,
      },
    })

    if (!organization?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Organization not found or missing Stripe customer' },
        { status: 404 }
      )
    }

    // Create subscription
    const subscription = await stripeServer.subscriptions.create({
      customer: organization.stripe_customer_id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    })

    const invoice = subscription.latest_invoice as Stripe.Invoice
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error) {
    console.error('Error creating subscription:', error)
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    )
  }
}
