import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { stripeServer } from 'common/src/util/stripe'
import { env } from '@/env'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string }
}

interface BulkInviteRequest {
  invitations: Array<{
    email: string
    role: 'admin' | 'member'
  }>
}

interface BulkInviteResult {
  success: boolean
  added: number
  skipped: Array<{
    email: string
    reason: string
  }>
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
    const body: BulkInviteRequest = await request.json()

    if (!body.invitations || !Array.isArray(body.invitations) || body.invitations.length === 0) {
      return NextResponse.json({ error: 'Invalid invitations array' }, { status: 400 })
    }

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

    // Find users by email
    const emails = body.invitations.map(inv => inv.email)
    const users = await db
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .where(inArray(schema.user.email, emails))

    const userMap = new Map(users.map(user => [user.email, user.id]))

    // Check existing memberships
    const existingMemberships = await db
      .select({ user_id: schema.orgMember.user_id })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          inArray(schema.orgMember.user_id, users.map(u => u.id))
        )
      )

    const existingMemberIds = new Set(existingMemberships.map(m => m.user_id))

    // Process invitations
    const validInvitations: Array<{ userId: string; role: 'admin' | 'member' }> = []
    const skipped: Array<{ email: string; reason: string }> = []

    for (const invitation of body.invitations) {
      const userId = userMap.get(invitation.email)
      
      if (!userId) {
        skipped.push({ email: invitation.email, reason: 'User not found' })
        continue
      }

      if (existingMemberIds.has(userId)) {
        skipped.push({ email: invitation.email, reason: 'Already a member' })
        continue
      }

      validInvitations.push({ userId, role: invitation.role })
    }

    // Add all valid members in a transaction
    let addedCount = 0
    if (validInvitations.length > 0) {
      await db.transaction(async (tx) => {
        for (const invitation of validInvitations) {
          await tx.insert(schema.orgMember).values({
            org_id: orgId,
            user_id: invitation.userId,
            role: invitation.role,
          })
          addedCount++
        }
      })
    }

    // Update Stripe subscription quantity once if members were added
    if (addedCount > 0 && organization.stripe_subscription_id) {
      try {
        const subscription = await stripeServer.subscriptions.retrieve(
          organization.stripe_subscription_id
        )
        
        const teamFeeItem = subscription.items.data.find(
          item => item.price.id === env.STRIPE_TEAM_FEE_PRICE_ID
        )
        
        if (teamFeeItem && teamFeeItem.quantity !== undefined) {
          const newQuantity = teamFeeItem.quantity + addedCount
          await stripeServer.subscriptionItems.update(teamFeeItem.id, {
            quantity: newQuantity,
            proration_behavior: 'create_prorations',
            proration_date: Math.floor(Date.now() / 1000),
          })

          logger.info(
            { orgId, addedCount, newQuantity },
            'Updated Stripe subscription quantity after bulk member addition'
          )
        }
      } catch (stripeError) {
        logger.error(
          { orgId, addedCount, error: stripeError },
          'Failed to update Stripe subscription quantity after bulk member addition'
        )
        // Don't fail the request if Stripe update fails
      }
    }

    return NextResponse.json({
      success: true,
      added: addedCount,
      skipped,
    }, { status: 201 })

  } catch (error) {
    console.error('Error bulk inviting members:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
