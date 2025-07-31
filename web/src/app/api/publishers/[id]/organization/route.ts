import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and } from 'drizzle-orm'
import { checkPublisherPermission } from '@/lib/publisher-permissions'
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { id: string }
}

// Link publisher to organization
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: publisherId } = params
    const { org_id } = await request.json()

    if (!org_id) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      )
    }

    // Check if user can edit this publisher
    const publisherPermission = await checkPublisherPermission(publisherId)
    if (!publisherPermission.success) {
      return NextResponse.json(
        { error: publisherPermission.error },
        { status: publisherPermission.status || 500 }
      )
    }

    // Check if user can manage the target organization
    const orgPermission = await checkOrganizationPermission(org_id, ['owner', 'admin'])
    if (!orgPermission.success) {
      return NextResponse.json(
        { error: 'Insufficient permissions for target organization' },
        { status: 403 }
      )
    }

    const publisher = publisherPermission.publisher!

    // Check if publisher is already linked to an organization
    if (publisher.org_id) {
      return NextResponse.json(
        { error: 'Publisher is already linked to an organization' },
        { status: 400 }
      )
    }

    // Check if publisher is user-owned (can only link user-owned publishers)
    if (!publisher.user_id) {
      return NextResponse.json(
        { error: 'Publisher must be user-owned to link to organization' },
        { status: 400 }
      )
    }

    // Update publisher to be owned by organization
    const [updatedPublisher] = await db
      .update(schema.publisher)
      .set({
        user_id: null,
        org_id: org_id,
        updated_at: new Date(),
      })
      .where(eq(schema.publisher.id, publisherId))
      .returning()

    logger.info(
      {
        publisherId,
        orgId: org_id,
        userId: session.user.id,
      },
      'Linked publisher to organization'
    )

    return NextResponse.json({
      ...updatedPublisher,
      ownershipType: 'organization',
    })
  } catch (error) {
    logger.error({ error }, 'Error linking publisher to organization')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Unlink publisher from organization
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: publisherId } = params

    // Check if user can edit this publisher
    const publisherPermission = await checkPublisherPermission(publisherId)
    if (!publisherPermission.success) {
      return NextResponse.json(
        { error: publisherPermission.error },
        { status: publisherPermission.status || 500 }
      )
    }

    const publisher = publisherPermission.publisher!

    // Check if publisher is organization-owned
    if (!publisher.org_id) {
      return NextResponse.json(
        { error: 'Publisher is not linked to an organization' },
        { status: 400 }
      )
    }

    // Update publisher to be owned by the creator
    const [updatedPublisher] = await db
      .update(schema.publisher)
      .set({
        user_id: publisher.created_by,
        org_id: null,
        updated_at: new Date(),
      })
      .where(eq(schema.publisher.id, publisherId))
      .returning()

    logger.info(
      {
        publisherId,
        orgId: publisher.org_id,
        userId: session.user.id,
        newOwnerId: publisher.created_by,
      },
      'Unlinked publisher from organization'
    )

    return NextResponse.json({
      ...updatedPublisher,
      ownershipType: 'user',
    })
  } catch (error) {
    logger.error({ error }, 'Error unlinking publisher from organization')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}