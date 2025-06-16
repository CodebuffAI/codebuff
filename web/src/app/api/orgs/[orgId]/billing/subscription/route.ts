import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { eq, and } from 'drizzle-orm'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import { stripeServer } from 'common/src/util/stripe'

interface RouteParams {
  params: {
    orgId: string
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

    // Check if user has permission to cancel subscription (owner/admin only)
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if organization has an active subscription
    if (!organization.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      )
    }

    // Cancel the Stripe subscription
    await stripeServer.subscriptions.cancel(organization.stripe_subscription_id)

    // Update organization record
    await db
      .update(schema.org)
      .set({
        stripe_subscription_id: null,
        auto_topup_enabled: false,
        updated_at: new Date(),
      })
      .where(eq(schema.org.id, orgId))

    logger.info(
      { orgId, subscriptionId: organization.stripe_subscription_id },
      'Successfully cancelled organization subscription'
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(
      { error: error.message, orgId },
      'Failed to cancel subscription'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
