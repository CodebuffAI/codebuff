import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { InviteMemberRequest } from 'common/types/organization'
import { updateStripeSubscriptionQuantity } from '@codebuff/billing'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    const userMembership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (userMembership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get all members
    const members = await db
      .select({
        user: {
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
        },
        role: schema.orgMember.role,
        joined_at: schema.orgMember.joined_at,
      })
      .from(schema.orgMember)
      .innerJoin(schema.user, eq(schema.orgMember.user_id, schema.user.id))
      .where(eq(schema.orgMember.org_id, orgId))

    return NextResponse.json({ members })
  } catch (error) {
    console.error('Error fetching organization members:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
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
    const body: InviteMemberRequest = await request.json()

    // Check if user is owner or admin and get organization details
    const membership = await db
      .select({
        role: schema.orgMember.role,
        organization: schema.org
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

    const { role: userRole, organization } = membership[0]
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Find user by email
    const targetUser = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, body.email))
      .limit(1)

    if (targetUser.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userId = targetUser[0].id

    // Check if user is already a member
    const existingMembership = await db
      .select()
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .limit(1)

    if (existingMembership.length > 0) {
      return NextResponse.json(
        { error: 'User is already a member' },
        { status: 409 }
      )
    }

    // Add member and get updated count in a transaction
    let actualQuantity = 0; // Initialize to handle edge cases
    await db.transaction(async (tx) => {
      // Add member
      await tx.insert(schema.orgMember).values({
        org_id: orgId,
        user_id: userId,
        role: body.role,
      })

      // Get current member count immediately after insert
      const memberCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.orgMember)
        .where(eq(schema.orgMember.org_id, orgId))

      actualQuantity = Math.max(1, memberCount[0].count) // Minimum 1 seat
    })

    // Update Stripe subscription quantity if subscription exists
    if (organization.stripe_subscription_id && actualQuantity > 0) {
      await updateStripeSubscriptionQuantity({
        stripeSubscriptionId: organization.stripe_subscription_id,
        actualQuantity,
        orgId,
        userId,
        context: 'added member'
      })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Error inviting member:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
