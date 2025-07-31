import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { PublisherIdSchema } from '@codebuff/common/types/publisher'
import { eq, and, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { checkOrgPublisherAccess } from '@/lib/publisher-permissions'
import {
  validatePublisherName,
  validatePublisherId,
} from '@/lib/validators/publisher'
import { logger } from '@/util/logger'

import type {
  CreatePublisherRequest,
  PublisherProfileResponse,
} from '@codebuff/common/types/publisher'
import type { NextRequest } from 'next/server'

export async function GET(): Promise<
  NextResponse<PublisherProfileResponse[] | { error: string }>
> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get all publishers the user has access to (owned by user or their organizations)
    const publishers = await db
      .select({
        publisher: schema.publisher,
        organization: schema.org,
      })
      .from(schema.publisher)
      .leftJoin(schema.org, eq(schema.publisher.org_id, schema.org.id))
      .leftJoin(
        schema.orgMember,
        and(
          eq(schema.orgMember.org_id, schema.publisher.org_id),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .where(
        or(
          eq(schema.publisher.user_id, userId),
          and(
            eq(schema.orgMember.user_id, userId),
            or(
              eq(schema.orgMember.role, 'owner'),
              eq(schema.orgMember.role, 'admin')
            )
          )
        )
      )

    const response: PublisherProfileResponse[] = await Promise.all(
      publishers.map(async ({ publisher, organization }) => {
        // Get distinct agent count for this publisher (not including versions)
        const agentCount = await db
          .selectDistinct({ id: schema.agentConfig.id })
          .from(schema.agentConfig)
          .where(eq(schema.agentConfig.publisher_id, publisher.id))
          .then((result) => result.length)

        return {
          ...publisher,
          agentCount,
          ownershipType: publisher.user_id ? 'user' : 'organization',
          organizationName: organization?.name,
        }
      })
    )

    return NextResponse.json(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching publisher profiles')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreatePublisherRequest = await request.json()
    const { id, name, email, bio, avatar_url, org_id } = body

    // Validate publisher ID
    const idValidationError = validatePublisherId(id)
    if (idValidationError) {
      return NextResponse.json({ error: idValidationError }, { status: 400 })
    }

    // Validate publisher name
    const nameValidationError = validatePublisherName(name)
    if (nameValidationError) {
      return NextResponse.json({ error: nameValidationError }, { status: 400 })
    }

    const trimmedName = name.trim()

    // If creating for an organization, check permissions
    if (org_id) {
      const permissionCheck = await checkOrgPublisherAccess(org_id)
      if (!permissionCheck.success) {
        return NextResponse.json(
          { error: permissionCheck.error },
          { status: permissionCheck.status || 500 }
        )
      }
    }

    // Ensure ID is unique
    const existingPublisher = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.id, id))
      .limit(1)

    if (existingPublisher.length > 0) {
      return NextResponse.json(
        { error: 'This publisher ID is already taken' },
        { status: 400 }
      )
    }

    // Create publisher
    const [newPublisher] = await db
      .insert(schema.publisher)
      .values({
        id,
        user_id: org_id ? null : session.user.id,
        org_id: org_id || null,
        created_by: session.user.id,
        name: trimmedName,
        email: email?.trim() || null,
        bio: bio?.trim() || null,
        avatar_url: avatar_url?.trim() || null,
        verified: false,
      })
      .returning()

    logger.info(
      {
        publisherId: newPublisher.id,
        userId: session.user.id,
        orgId: org_id,
        ownershipType: org_id ? 'organization' : 'user',
      },
      'Created new publisher profile'
    )

    const response: PublisherProfileResponse = {
      ...newPublisher,
      agentCount: 0,
      ownershipType: org_id ? 'organization' : 'user',
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    logger.error({ error }, 'Error creating publisher profile')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
