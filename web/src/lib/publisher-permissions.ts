import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and } from 'drizzle-orm'
import { OrganizationRole } from '@codebuff/common/types/organization'
import { Publisher } from '@codebuff/common/types/publisher'
import { logger } from '@/util/logger'

export interface PublisherPermissionResult {
  success: boolean
  error?: string
  status?: number
  userId?: string
  publisherId?: string
  publisher?: Publisher
  ownershipType?: 'user' | 'organization'
  userRole?: OrganizationRole
}

/**
 * Checks if a user can edit a publisher based on the unified ownership model
 */
export async function checkPublisherPermission(
  publisherId: string
): Promise<PublisherPermissionResult> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
        status: 401,
      }
    }

    const userId = session.user.id

    // Get publisher details
    const publishers = await db
      .select()
      .from(schema.publisher)
      .where(eq(schema.publisher.id, publisherId))
      .limit(1)

    if (publishers.length === 0) {
      return {
        success: false,
        error: 'Publisher not found',
        status: 404,
        userId,
        publisherId,
      }
    }

    const publisher = publishers[0]

    // Check direct user ownership
    if (publisher.user_id === userId) {
      return {
        success: true,
        userId,
        publisherId,
        publisher,
        ownershipType: 'user',
      }
    }

    // Check org-based access
    if (publisher.org_id) {
      const membership = await db
        .select({ role: schema.orgMember.role })
        .from(schema.orgMember)
        .where(
          and(
            eq(schema.orgMember.org_id, publisher.org_id),
            eq(schema.orgMember.user_id, userId)
          )
        )
        .limit(1)

      if (membership.length === 0) {
        return {
          success: false,
          error: 'Publisher not found',
          status: 404,
          userId,
          publisherId,
        }
      }

      const userRole = membership[0].role
      if (userRole === 'owner' || userRole === 'admin') {
        return {
          success: true,
          userId,
          publisherId,
          publisher,
          ownershipType: 'organization',
          userRole,
        }
      }

      return {
        success: false,
        error: 'Insufficient permissions',
        status: 403,
        userId,
        publisherId,
        userRole,
      }
    }

    return {
      success: false,
      error: 'Publisher not found',
      status: 404,
      userId,
      publisherId,
    }
  } catch (error) {
    logger.error(
      { publisherId, error },
      'Error checking publisher permissions'
    )
    return {
      success: false,
      error: 'Internal server error',
      status: 500,
    }
  }
}

/**
 * Gets the billing entity for a publisher (user or organization)
 */
export function getPublisherBillingEntity(publisher: Publisher): {
  type: 'user' | 'org'
  id: string
} {
  if (publisher.user_id) {
    return { type: 'user', id: publisher.user_id }
  }
  if (publisher.org_id) {
    return { type: 'org', id: publisher.org_id }
  }
  throw new Error('Publisher has no valid owner')
}

/**
 * Checks if a user can create a publisher for an organization
 */
export async function checkOrgPublisherAccess(
  organizationId: string
): Promise<{
  success: boolean
  error?: string
  status?: number
  userRole?: OrganizationRole
}> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
        status: 401,
      }
    }

    const userId = session.user.id

    // Check user's role in the organization
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, organizationId),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return {
        success: false,
        error: 'Organization not found',
        status: 404,
      }
    }

    const userRole = membership[0].role
    if (userRole === 'owner' || userRole === 'admin') {
      return {
        success: true,
        userRole,
      }
    }

    return {
      success: false,
      error: 'Insufficient permissions',
      status: 403,
      userRole,
    }
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Error checking organization publisher creation permissions'
    )
    return {
      success: false,
      error: 'Internal server error',
      status: 500,
    }
  }
}