import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string; email: string }
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

    const { orgId, email } = params
    const decodedEmail = decodeURIComponent(email)

    // Check if user is owner or admin
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
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

    const { role: userRole } = membership[0]
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Find the existing invitation
    const existingInvitation = await db
      .select()
      .from(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          eq(schema.orgInvite.email, decodedEmail),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .limit(1)

    if (existingInvitation.length === 0) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    // Update the invitation with new token and expiry
    const newToken = crypto.randomUUID()
    const newExpiresAt = new Date()
    newExpiresAt.setDate(newExpiresAt.getDate() + 7) // 7 days from now

    await db
      .update(schema.orgInvite)
      .set({
        token: newToken,
        expires_at: newExpiresAt,
        invited_by: session.user.id, // Update who resent it
      })
      .where(eq(schema.orgInvite.id, existingInvitation[0].id))

    logger.info(
      { orgId, email: decodedEmail },
      'Organization invitation resent'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error resending invitation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
