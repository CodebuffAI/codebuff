import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and } from 'drizzle-orm'
import { OrganizationRole } from 'common/types/organization'
import { logger } from '@/util/logger'

export interface OrganizationPermissionResult {
  success: boolean
  error?: string
  status?: number
  userId?: string
  organizationId?: string
  userRole?: OrganizationRole
  organization?: typeof schema.org.$inferSelect
}

/**
 * Checks if a user has the required permission level for an organization
 */
export async function checkOrganizationPermission(
  organizationId: string,
  requiredRole: OrganizationRole | OrganizationRole[] = 'member'
): Promise<OrganizationPermissionResult> {
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

    // Get user's membership and organization details
    const membership = await db
      .select({
        role: schema.orgMember.role,
        organization: schema.org,
      })
      .from(schema.orgMember)
      .innerJoin(
        schema.org,
        eq(schema.orgMember.org_id, schema.org.id)
      )
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
        userId,
        organizationId,
      }
    }

    const { role, organization } = membership[0]

    // Check if user has required role
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    const roleHierarchy: Record<OrganizationRole, number> = {
      member: 1,
      admin: 2,
      owner: 3,
    }

    const userRoleLevel = roleHierarchy[role]
    const requiredLevel = Math.min(...allowedRoles.map(r => roleHierarchy[r]))

    if (userRoleLevel < requiredLevel) {
      logger.warn(
        { userId, organizationId, userRole: role, requiredRoles: allowedRoles },
        'User lacks required organization permissions'
      )
      return {
        success: false,
        error: 'Insufficient permissions',
        status: 403,
        userId,
        organizationId,
        userRole: role,
      }
    }

    return {
      success: true,
      userId,
      organizationId,
      userRole: role,
      organization,
    }
  } catch (error) {
    logger.error(
      { organizationId, requiredRole, error },
      'Error checking organization permissions'
    )
    return {
      success: false,
      error: 'Internal server error',
      status: 500,
    }
  }
}

/**
 * Middleware wrapper for organization permission checking
 */
export function withOrganizationPermission(
  requiredRole: OrganizationRole | OrganizationRole[] = 'member'
) {
  return async function<T extends { params: { orgId: string } }>(
    handler: (
      request: Request,
      context: T,
      permissionResult: OrganizationPermissionResult
    ) => Promise<Response>
  ) {
    return async (request: Request, context: T): Promise<Response> => {
      const { orgId } = context.params
      const permissionResult = await checkOrganizationPermission(orgId, requiredRole)

      if (!permissionResult.success) {
        return new Response(
          JSON.stringify({ error: permissionResult.error }),
          {
            status: permissionResult.status || 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return handler(request, context, permissionResult)
    }
  }
}

/**
 * Checks if a repository is approved for an organization
 */
export async function checkRepositoryAccess(
  organizationId: string,
  repositoryUrl: string
): Promise<{ approved: boolean; repositoryId?: string }> {
  try {
    const repository = await db
      .select({ id: schema.orgRepo.id })
      .from(schema.orgRepo)
      .where(
        and(
          eq(schema.orgRepo.org_id, organizationId),
          eq(schema.orgRepo.repo_url, repositoryUrl),
          eq(schema.orgRepo.is_active, true)
        )
      )
      .limit(1)

    return {
      approved: repository.length > 0,
      repositoryId: repository[0]?.id,
    }
  } catch (error) {
    logger.error(
      { organizationId, repositoryUrl, error },
      'Error checking repository access'
    )
    return { approved: false }
  }
}

/**
 * Logs organization actions for audit purposes
 */
export async function logOrganizationAction(
  organizationId: string,
  userId: string,
  action: string,
  details?: Record<string, any>
) {
  try {
    logger.info(
      {
        organizationId,
        userId,
        action,
        details,
        timestamp: new Date().toISOString(),
      },
      'Organization action logged'
    )
    // TODO: Store in dedicated audit log table when implemented
  } catch (error) {
    logger.error(
      { organizationId, userId, action, error },
      'Failed to log organization action'
    )
  }
}
