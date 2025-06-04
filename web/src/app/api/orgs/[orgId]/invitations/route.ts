import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { sendOrganizationInvitationEmail } from '@/lib/loops-email'
import { logger } from '@/util/logger'
import crypto from 'crypto'

interface RouteParams {
  params: { orgId: string }
}

interface InviteRequest {
  email: string
  role: 'admin' | 'member'
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params
    const body: InviteRequest = await request.json()

    // Validate input
    if (!body.email || !body.role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      )
    }

    if (!['admin', 'member'].includes(body.role)) {
      return NextResponse.json(
        { error: 'Role must be admin or member' },
        { status: 400 }
      )
    }

    // Check permissions - only owners and admins can invite
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

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(schema.orgMember)
      .innerJoin(schema.user, eq(schema.orgMember.user_id, schema.user.id))
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.user.email, body.email)
        )
      )
      .limit(1)

    if (existingMember.length > 0) {
      return NextResponse.json(
        { error: 'User is already a member of this organization' },
        { status: 409 }
      )
    }

    // Check if there's already a pending invitation
    const existingInvitation = await db
      .select()
      .from(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          eq(schema.orgInvite.email, body.email),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .limit(1)

    if (existingInvitation.length > 0) {
      return NextResponse.json(
        { error: 'Invitation already sent to this email' },
        { status: 409 }
      )
    }

    // Generate secure invitation token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Create invitation record
    const [invitation] = await db
      .insert(schema.orgInvite)
      .values({
        org_id: orgId,
        email: body.email,
        role: body.role,
        token,
        invited_by: session.user.id,
        expires_at: expiresAt,
      })
      .returning()

    // Get inviter information
    const inviter = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id))
      .limit(1)

    // Send invitation email
    const invitationUrl = `${request.nextUrl.origin}/invites/${token}`
    const emailResult = await sendOrganizationInvitationEmail({
      email: body.email,
      organizationName: organization!.name,
      inviterName: inviter[0]?.name || 'Someone',
      invitationUrl,
      role: body.role,
    })

    if (!emailResult.success) {
      // Delete the invitation if email failed
      await db
        .delete(schema.orgInvite)
        .where(eq(schema.orgInvite.id, invitation.id))

      return NextResponse.json(
        { error: 'Failed to send invitation email' },
        { status: 500 }
      )
    }

    logger.info(
      {
        organizationId: orgId,
        invitedEmail: body.email,
        invitedBy: session.user.id,
        role: body.role,
      },
      'Organization invitation sent successfully'
    )

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at.toISOString(),
      },
    })
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, error },
      'Error sending organization invitation'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check permissions - only members can view invitations
    const permissionResult = await checkOrganizationPermission(orgId, 'member')
    if (!permissionResult.success) {
      return NextResponse.json(
        { error: permissionResult.error },
        { status: permissionResult.status || 500 }
      )
    }

    // Get pending invitations
    const invitations = await db
      .select({
        id: schema.orgInvite.id,
        email: schema.orgInvite.email,
        role: schema.orgInvite.role,
        invited_by_name: schema.user.name,
        created_at: schema.orgInvite.created_at,
        expires_at: schema.orgInvite.expires_at,
      })
      .from(schema.orgInvite)
      .innerJoin(schema.user, eq(schema.orgInvite.invited_by, schema.user.id))
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .orderBy(schema.orgInvite.created_at)

    return NextResponse.json({ invitations })
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, error },
      'Error fetching organization invitations'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
