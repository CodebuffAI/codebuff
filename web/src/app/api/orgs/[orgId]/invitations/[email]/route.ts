import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string; email: string }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, email } = params

    // Check permissions - only owners and admins can cancel invitations
    const permissionResult = await checkOrganizationPermission(orgId, [
      'owner',
      'admin',
    ])
    if (!permissionResult.success) {
      return NextResponse.json(
        { error: permissionResult.error },
        { status: permissionResult.status || 500 }
      )
    }

    // Find and delete the pending invitation
    const deletedInvitations = await db
      .delete(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          eq(schema.orgInvite.email, email),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .returning()

    if (deletedInvitations.length === 0) {
      return NextResponse.json(
        { error: 'No pending invitation found for this email' },
        { status: 404 }
      )
    }

    logger.info(
      {
        organizationId: orgId,
        cancelledEmail: email,
        cancelledBy: session.user.id,
      },
      'Organization invitation cancelled'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, email: params.email, error },
      'Error cancelling organization invitation'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
