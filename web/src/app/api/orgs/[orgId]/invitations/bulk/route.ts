import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { sendOrganizationInvitationEmail } from '@codebuff/integrations' // Updated import
import { logger } from '@/util/logger'
import crypto from 'crypto'
import { env } from '@/env.mjs'; // Added import

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
  results: Array<{
    email: string
    success: boolean
    error?: string
    invitationId?: string
  }>
  summary: {
    total: number
    successful: number
    failed: number
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params
    const body: BulkInviteRequest = await request.json()

    // Validate input
    if (
      !body.invitations ||
      !Array.isArray(body.invitations) ||
      body.invitations.length === 0
    ) {
      return NextResponse.json(
        { error: 'Invitations array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (body.invitations.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 invitations allowed per bulk request' },
        { status: 400 }
      )
    }

    // Validate each invitation
    for (const invitation of body.invitations) {
      if (!invitation.email || !invitation.role) {
        return NextResponse.json(
          { error: 'Each invitation must have email and role' },
          { status: 400 }
        )
      }

      if (!['admin', 'member'].includes(invitation.role)) {
        return NextResponse.json(
          { error: 'Role must be admin or member' },
          { status: 400 }
        )
      }
    }

    // Check permissions - only owners and admins can send bulk invitations
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

    // Get all emails to check for existing members and invitations
    const emails = body.invitations.map((inv) => inv.email)

    // Check for existing members
    const existingMembers = await db
      .select({ email: schema.user.email })
      .from(schema.orgMember)
      .innerJoin(schema.user, eq(schema.orgMember.user_id, schema.user.id))
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          inArray(schema.user.email, emails)
        )
      )

    const existingMemberEmails = new Set(existingMembers.map((m) => m.email))

    // Check for existing pending invitations
    const existingInvitations = await db
      .select({ email: schema.orgInvite.email })
      .from(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          inArray(schema.orgInvite.email, emails),
          isNull(schema.orgInvite.accepted_at)
        )
      )

    const existingInvitationEmails = new Set(
      existingInvitations.map((i) => i.email)
    )

    // Get inviter information
    const inviter = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id))
      .limit(1)

    const inviterName = inviter[0]?.name || 'Someone'

    // Process each invitation
    const results: BulkInviteResult['results'] = []
    let successful = 0
    let failed = 0

    for (const invitation of body.invitations) {
      try {
        // Check if user is already a member
        if (existingMemberEmails.has(invitation.email)) {
          results.push({
            email: invitation.email,
            success: false,
            error: 'User is already a member of this organization',
          })
          failed++
          continue
        }

        // Check if invitation already exists
        if (existingInvitationEmails.has(invitation.email)) {
          results.push({
            email: invitation.email,
            success: false,
            error: 'Invitation already sent to this email',
          })
          failed++
          continue
        }

        // Generate secure invitation token
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        // Create invitation record
        const [inviteRecord] = await db
          .insert(schema.orgInvite)
          .values({
            org_id: orgId,
            email: invitation.email,
            role: invitation.role,
            token,
            invited_by: session.user.id,
            expires_at: expiresAt,
          })
          .returning()

        // Send invitation email
        const invitationUrl = `${env.NEXT_PUBLIC_APP_URL}/invites/${token}` // Replaced request.nextUrl.origin
        const emailResult = await sendOrganizationInvitationEmail({
          email: invitation.email,
          organizationName: organization!.name,
          inviterName,
          invitationUrl,
          role: invitation.role,
        })

        if (!emailResult.success) {
          // Delete the invitation if email failed
          await db
            .delete(schema.orgInvite)
            .where(eq(schema.orgInvite.id, inviteRecord.id))

          results.push({
            email: invitation.email,
            success: false,
            error: 'Failed to send invitation email',
          })
          failed++
          continue
        }

        results.push({
          email: invitation.email,
          success: true,
          invitationId: inviteRecord.id,
        })
        successful++
      } catch (error) {
        logger.error(
          { organizationId: orgId, email: invitation.email, error },
          'Error processing bulk invitation'
        )

        results.push({
          email: invitation.email,
          success: false,
          error: 'Internal error processing invitation',
        })
        failed++
      }
    }

    logger.info(
      {
        organizationId: orgId,
        invitedBy: session.user.id,
        total: body.invitations.length,
        successful,
        failed,
      },
      'Bulk organization invitations processed'
    )

    const response: BulkInviteResult = {
      success: successful > 0,
      results,
      summary: {
        total: body.invitations.length,
        successful,
        failed,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, error },
      'Error processing bulk organization invitations'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
