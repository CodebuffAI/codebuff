import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { checkOrganizationPermission } from '@/lib/organization-permissions'
import { logger } from '@/util/logger'
import type { PublisherProfileResponse } from '@codebuff/common/types/publisher'

interface RouteParams {
  params: { orgId: string }
}

// Get all publishers for organization
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user has access to this organization
    const orgPermission = await checkOrganizationPermission(orgId, ['owner', 'admin', 'member'])
    if (!orgPermission.success) {
      return NextResponse.json(
        { error: orgPermission.error },
        { status: orgPermission.status || 500 }
      )
    }

    // Find all publishers for this organization
    const publishers = await db
      .select({
        id: schema.publisher.id,
        name: schema.publisher.name,
        verified: schema.publisher.verified,
        bio: schema.publisher.bio,
        avatar_url: schema.publisher.avatar_url,
        created_at: schema.publisher.created_at,
        user_id: schema.publisher.user_id,
        org_id: schema.publisher.org_id,
        created_by: schema.publisher.created_by,
        updated_at: schema.publisher.updated_at,
        email: schema.publisher.email,
      })
      .from(schema.publisher)
      .where(eq(schema.publisher.org_id, orgId))

    // Get agent count for each publisher
    const response: PublisherProfileResponse[] = await Promise.all(
      publishers.map(async (publisher) => {
        const agentCount = await db
          .select({ count: schema.agentConfig.id })
          .from(schema.agentConfig)
          .where(eq(schema.agentConfig.publisher_id, publisher.id))
          .then((result) => result.length)

        return {
          ...publisher,
          agentCount,
          ownershipType: 'organization' as const,
        }
      })
    )

    return NextResponse.json({ publishers: response })
  } catch (error) {
    logger.error({ error, orgId: params.orgId }, 'Error fetching organization publishers')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
