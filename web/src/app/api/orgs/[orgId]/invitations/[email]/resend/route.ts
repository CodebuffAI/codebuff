import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { sendOrganizationInvitationEmail } from '@/lib/loops-email'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string; email: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, email } = params

    // Check permissions - only owners and admins can resend invitations
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

    const { organization } = permissionResult

    // Find the pending invitation
    const invitation = await db
      .select()
      .from(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          eq(schema.orgInvite.email, email),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .limit(1)

    if (invitation.length === 0) {
      return NextResponse.json(
        { error: 'No pending invitation found for this email' },
        { status: 404 }
      )
    }

    const inviteRecord = invitation[0]

    // Extend expiration date by 7 days from now
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // Update the invitation with new expiration date
    await db
      .update(schema.orgInvite)
      .set({ expires_at: newExpiresAt })
      .where(eq(schema.orgInvite.id, inviteRecord.id))

    // Get inviter information
    const inviter = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id))
      .limit(1)

    // Resend invitation email
    const invitationUrl = `${request.nextUrl.origin}/invites/${inviteRecord.token}`
    const emailResult = await sendOrganizationInvitationEmail({
      email: inviteRecord.email,
      organizationName: organization!.name,
      inviterName: inviter[0]?.name || 'Someone',
      invitationUrl,
      role: inviteRecord.role,
    })

    if (!emailResult.success) {
      return NextResponse.json(
        { error: 'Failed to resend invitation email' },
        { status: 500 }
      )
    }

    logger.info(
      {
        organizationId: orgId,
        invitedEmail: email,
        resentBy: session.user.id,
        newExpiresAt,
      },
      'Organization invitation resent successfully'
    )

    return NextResponse.json({
      success: true,
      message: 'Invitation resent successfully',
      expires_at: newExpiresAt.toISOString(),
    })
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, email: params.email, error },
      'Error resending organization invitation'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
