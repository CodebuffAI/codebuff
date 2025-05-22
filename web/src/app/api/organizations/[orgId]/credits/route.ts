import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { stripeServer } from 'common/util/stripe'
import { generateOperationIdTimestamp } from '@codebuff/billing'
import { dollarsToCredits } from '@/lib/currency'

interface RouteParams {
  params: { orgId: string }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params
    const body = await request.json()
    const { amount } = body // Amount in USD cents

    if (!amount || amount < 100) {
      return NextResponse.json(
        { error: 'Minimum purchase amount is $1.00' },
        { status: 400 }
      )
    }

    // Check if user is owner of this organization
    const membership = await db
      .select({ 
        role: schema.organizationMember.role,
        organization: schema.organization
      })
      .from(schema.organizationMember)
      .innerJoin(
        schema.organization,
        eq(schema.organizationMember.organization_id, schema.organization.id)
      )
      .where(
        and(
          eq(schema.organizationMember.organization_id, orgId),
          eq(schema.organizationMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { role, organization } = membership[0]
    if (role !== 'owner') {
      return NextResponse.json({ 
        error: 'Only organization owners can purchase credits' 
      }, { status: 403 })
    }

    // Check if organization has Stripe customer
    if (!organization.stripe_customer_id) {
      return NextResponse.json({
        error: 'Organization billing not set up. Please contact support.',
      }, { status: 400 })
    }

    // Calculate credits from amount
    const credits = dollarsToCredits(amount / 100, 1) // Convert cents to dollars, 1 cent per credit
    const operationId = generateOperationIdTimestamp(new Date())

    // Create Stripe checkout session
    const checkoutSession = await stripeServer.checkout.sessions.create({
      customer: organization.stripe_customer_id,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits.toLocaleString()} Codebuff Credits`,
              description: `Credits for ${organization.name}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${request.nextUrl.origin}/organizations/${orgId}?purchase=success`,
      cancel_url: `${request.nextUrl.origin}/organizations/${orgId}?purchase=cancelled`,
      metadata: {
        grantType: 'organization_purchase',
        organizationId: orgId,
        credits: credits.toString(),
        operationId,
      },
    })

    return NextResponse.json({ 
      checkout_url: checkoutSession.url,
      credits,
      amount: amount / 100 // Return amount in dollars
    })
  } catch (error) {
    console.error('Error creating organization credit purchase:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
