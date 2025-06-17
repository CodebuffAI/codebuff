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

export async function DELETE(
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

    // Delete the invitation
    const result = await db
      .delete(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          eq(schema.orgInvite.email, decodedEmail),
          isNull(schema.orgInvite.accepted_at)
        )
      )

    logger.info(
      { orgId, email: decodedEmail },
      'Organization invitation cancelled'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error cancelling invitation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
