import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq, and, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { ORG_BILLING_ENABLED } from '@/lib/billing-config'
import { logger } from '@/util/logger'

interface RouteParams {
  params: Promise<{
    orgId: string
  }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!ORG_BILLING_ENABLED) {
    return NextResponse.json({ error: 'Organization billing is temporarily disabled' }, { status: 503 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

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
          eq(schema.orgMember.user_id, session.user.id),
        ),
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 },
      )
    }

    const { role, organization } = membership[0]

    // Check if user has permission to view billing
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 },
      )
    }

    // Get member count for the organization
    const memberCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orgMember)
      .where(eq(schema.orgMember.org_id, orgId))

    const seatCount = Math.max(1, memberCount[0].count) // Minimum 1 seat

    // Get subscription details if it exists
    let subscriptionDetails = null

    if (organization.stripe_customer_id && organization.stripe_subscription_id) {
      try {
        const subscription = await stripeServer.subscriptions.retrieve(
          organization.stripe_subscription_id,
        )

        subscriptionDetails = {
          status: subscription.status,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
        }
      } catch (error) {
        logger.warn({ orgId, error }, 'Failed to get Stripe subscription details')
      }
    }

    // Get price per seat from environment (assuming it's stored there)
    const pricePerSeat = 10 // $10 per seat per month - this could be fetched from Stripe price

    return NextResponse.json({
      seatCount,
      pricePerSeat,
      totalMonthlyCost: seatCount * pricePerSeat,
      hasActiveSubscription: !!organization.stripe_subscription_id,
      subscriptionDetails,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    })
  } catch (error: any) {
    logger.error(
      { error: error.message, orgId },
      'Failed to get billing status',
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
