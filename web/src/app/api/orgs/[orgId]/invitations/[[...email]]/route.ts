import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm' // Added inArray
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { sendOrganizationInvitationEmail } from '@codebuff/internal/loops'
import { logger } from '@/util/logger'
import crypto from 'crypto'
import { env } from '@/env.mjs'

interface RouteParams {
  params: {
    orgId: string
    email?: string[] // e.g., ['user@example.com'] or ['user@example.com', 'resend']
  }
}

interface InviteRequest {
  email: string
  role: 'admin' | 'member'
}

// POST handles:
// 1. Create new invitation (if params.email is undefined)
// 2. Resend invitation (if params.email is [email, 'resend'])
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId, email: emailParams } = params
  const action = emailParams?.[1]
  const specificEmail = emailParams?.[0]

  // Check permissions - only owners and admins can invite/resend
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

  // Inviter information (common for create and resend)
  const inviter = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .limit(1)
  const inviterName = inviter[0]?.name || 'Someone'

  // === RESEND INVITATION LOGIC ===
  if (action === 'resend' && specificEmail) {
    try {
      const existingInvitation = await db
        .select()
        .from(schema.orgInvite)
        .where(
          and(
            eq(schema.orgInvite.org_id, orgId),
            eq(schema.orgInvite.email, specificEmail),
            isNull(schema.orgInvite.accepted_at)
          )
        )
        .limit(1)

      if (existingInvitation.length === 0) {
        return NextResponse.json(
          { error: 'No pending invitation found for this email to resend' },
          { status: 404 }
        )
      }
      const inviteRecord = existingInvitation[0]
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      await db
        .update(schema.orgInvite)
        .set({ expires_at: newExpiresAt })
        .where(eq(schema.orgInvite.id, inviteRecord.id))

      const invitationUrl = `${env.NEXT_PUBLIC_APP_URL}/invites/${inviteRecord.token}` // Replaced request.nextUrl.origin
      const emailResult = await sendOrganizationInvitationEmail({
        email: inviteRecord.email,
        organizationName: organization!.name,
        inviterName, // Using fetched inviterName
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
          invitedEmail: specificEmail,
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
        { organizationId: orgId, email: specificEmail, error },
        'Error resending organization invitation'
      )
      return NextResponse.json(
        { error: 'Internal server error during resend' },
        { status: 500 }
      )
    }
  }
  // === CREATE NEW INVITATION LOGIC ===
  else if (!emailParams || emailParams.length === 0) {
    try {
      const body: InviteRequest = await request.json()
      if (!body.email || !body.role) {
        return NextResponse.json(
          { error: 'Email and role are required for new invitation' },
          { status: 400 }
        )
      }
      if (!['admin', 'member'].includes(body.role)) {
        return NextResponse.json(
          { error: 'Role must be admin or member' },
          { status: 400 }
        )
      }

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

      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

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

      const invitationUrl = `${env.NEXT_PUBLIC_APP_URL}/invites/${token}` // Replaced request.nextUrl.origin
      const emailResult = await sendOrganizationInvitationEmail({
        email: body.email,
        organizationName: organization!.name,
        inviterName, // Using fetched inviterName
        invitationUrl,
        role: body.role,
      })

      if (!emailResult.success) {
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
        { organizationId: orgId, error },
        'Error sending organization invitation'
      )
      return NextResponse.json(
        { error: 'Internal server error during create' },
        { status: 500 }
      )
    }
  }
  // Fallback for invalid POST requests to /invitations/*
  return NextResponse.json(
    { error: 'Invalid request path for POST' },
    { status: 404 }
  )
}

// GET handles:
// 1. List invitations (if params.email is undefined)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId, email: emailParams } = params

  // Check permissions - only members can view invitations
  const permissionResult = await checkOrganizationPermission(orgId, 'member')
  if (!permissionResult.success) {
    return NextResponse.json(
      { error: permissionResult.error },
      { status: permissionResult.status || 500 }
    )
  }

  // === LIST INVITATIONS LOGIC ===
  if (!emailParams || emailParams.length === 0) {
    try {
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
        { organizationId: orgId, error },
        'Error fetching organization invitations'
      )
      return NextResponse.json(
        { error: 'Internal server error during list' },
        { status: 500 }
      )
    }
  }
  // Fallback for invalid GET requests to /invitations/*
  return NextResponse.json(
    { error: 'Invalid request path for GET' },
    { status: 404 }
  )
}

// DELETE handles:
// 1. Cancel/delete invitation (if params.email is [email])
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId, email: emailParams } = params
  const specificEmail = emailParams?.[0]

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

  // === CANCEL INVITATION LOGIC ===
  if (specificEmail && emailParams?.length === 1) {
    try {
      const deletedInvitations = await db
        .delete(schema.orgInvite)
        .where(
          and(
            eq(schema.orgInvite.org_id, orgId),
            eq(schema.orgInvite.email, specificEmail),
            isNull(schema.orgInvite.accepted_at)
          )
        )
        .returning()

      if (deletedInvitations.length === 0) {
        return NextResponse.json(
          { error: 'No pending invitation found for this email to delete' },
          { status: 404 }
        )
      }
      logger.info(
        {
          organizationId: orgId,
          cancelledEmail: specificEmail,
          cancelledBy: session.user.id,
        },
        'Organization invitation cancelled'
      )
      return NextResponse.json({ success: true })
    } catch (error) {
      logger.error(
        { organizationId: orgId, email: specificEmail, error },
        'Error cancelling organization invitation'
      )
      return NextResponse.json(
        { error: 'Internal server error during delete' },
        { status: 500 }
      )
    }
  }
  // Fallback for invalid DELETE requests to /invitations/*
  return NextResponse.json(
    { error: 'Invalid request path for DELETE' },
    { status: 404 }
  )
}
