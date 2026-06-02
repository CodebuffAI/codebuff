import { QueryCtx, ActionCtx } from "./_generated/server";
import { OrgRole, OrgPermission } from "./schema";

/**
 * Organization role-based permission matrix
 */
const ORG_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  "org:admin": ["read", "write", "admin", "billing"],
  "org:member": ["read", "write"],
  "org:viewer": ["read"],
};

/**
 * Extract organization context from Clerk JWT token
 */
export async function getOrganizationContext(ctx: QueryCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  // Extract organization info from Clerk JWT token
  // Clerk includes organization info when user is in organization context
  const organizationId =
    (identity as any)?.org_id ||
    (identity as any)?.organizationId ||
    (identity as any)?.organization?.id ||
    (identity as any)?.activeOrganizationId;

  const orgRole = (identity as any)?.org_role as OrgRole | undefined;
  const orgSlug = (identity as any)?.org_slug;
  const orgName = (identity as any)?.org_name;

  if (!organizationId) {
    return null; // User not in organization context
  }

  return {
    organizationId,
    role: orgRole || "org:member", // Default to member if role not specified
    slug: orgSlug,
    name: orgName,
  };
}

/**
 * Check if user has required permission in organization
 */
export function hasOrganizationPermission(
  userRole: OrgRole,
  requiredPermission: OrgPermission,
): boolean {
  const userPermissions = ORG_PERMISSIONS[userRole] || [];
  return userPermissions.includes(requiredPermission);
}

/**
 * Verify organization access for a project
 * @param orgContext - Optional pre-fetched org context to avoid duplicate JWT fetches
 */
export async function verifyOrganizationAccess(
  ctx: QueryCtx | ActionCtx,
  projectOrganizationId: string,
  requiredPermission: OrgPermission = "read",
  orgContext?: Awaited<ReturnType<typeof getOrganizationContext>>,
): Promise<boolean> {
  // Use provided context or fetch it
  const context = orgContext ?? (await getOrganizationContext(ctx));

  if (!context) {
    return false; // User not in any organization
  }

  // Check if user is in the same organization as the project
  if (context.organizationId !== projectOrganizationId) {
    return false; // User not in project's organization
  }

  // Check if user has required permission
  return hasOrganizationPermission(context.role, requiredPermission);
}

/**
 * Security audit log entry
 */
export interface SecurityAuditLog {
  userId: string;
  organizationId: string | null;
  action: string;
  resource: string;
  permitted: boolean;
  timestamp: number;
  clientIP?: string;
}

/**
 * Log security-relevant actions for audit trail
 */
export async function logSecurityAction(
  ctx: QueryCtx | ActionCtx,
  action: string,
  resource: string,
  permitted: boolean,
  additionalData?: Record<string, any>,
) {
  const identity = await ctx.auth.getUserIdentity();
  const orgContext = await getOrganizationContext(ctx);

  const logEntry: SecurityAuditLog = {
    userId: identity?.subject || "anonymous",
    organizationId: orgContext?.organizationId || null,
    action,
    resource,
    permitted,
    timestamp: Date.now(),
    ...additionalData,
  };

  // Only log security-critical events (access denied, suspicious activity)
  // Comment out for now to reduce noise - uncomment when needed for debugging
  // console.log("[SECURITY AUDIT]", JSON.stringify(logEntry));

  // TODO: Implement proper audit logging to database or external service
}
