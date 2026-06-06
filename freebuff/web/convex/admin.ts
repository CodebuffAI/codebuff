import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { getAuthUser } from "./users";
import {
  trackUsage,
  getCustomerData,
  getTierFromCustomerData,
} from "../lib/autumn-api";
import { PAUSE_REASON_VALIDATOR } from "./constants";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import {
  allUsers,
  allProjects,
  allConvexInstances,
  usersByRole,
  usersByTier,
  usersByDay,
  pausedProjectsByActive,
  pausedUsersByActive,
  getDayKeyForDaysAgo,
  computeRollingWindows,
} from "./aggregates/admin_aggregates";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  hobby: "Hobby",
  business: "Business",
  scale: "Scale",
  priority: "Priority",
  ultra: "Ultra",
  max: "Max",
  unlimited: "Unlimited",
  enterprise: "Enterprise",
};

const PLAN_ID_TO_TIER: Record<string, string> = {
  free_plan: "free",
  starter_plan: "starter",
  hobby_plan: "hobby",
  business_plan: "business",
  scale_plan: "scale",
  priority_plan: "priority",
  ultra_plan: "ultra",
  max_plan: "max",
  unlimited_plan: "unlimited",
  enterprise_plan: "enterprise",
  hobby_custom_plan: "hobby",
  pro_plan: "business",
  pro_custom_plan: "business",
  team_plan: "scale",
  team_custom_plan: "scale",
  enterprise_custom_plan: "enterprise",
};

function inferTierFromPlanName(name?: string | null): string | null {
  if (!name) return null;
  const normalized = name.toLowerCase();
  if (normalized.includes("enterprise")) return "enterprise";
  if (normalized.includes("unlimited")) return "unlimited";
  if (normalized.includes("max")) return "max";
  if (normalized.includes("ultra")) return "ultra";
  if (normalized.includes("priority")) return "priority";
  if (normalized.includes("scale") || normalized.includes("team"))
    return "scale";
  if (normalized.includes("business") || normalized.includes("pro"))
    return "business";
  if (normalized.includes("hobby")) return "hobby";
  if (normalized.includes("starter")) return "starter";
  if (normalized.includes("free")) return "free";
  return null;
}

function getTierRank(tier: string | null | undefined): number {
  switch (tier) {
    case "free":
      return 0;
    case "starter":
      return 1;
    case "hobby":
      return 2;
    case "business":
      return 3;
    case "scale":
      return 4;
    case "priority":
      return 5;
    case "ultra":
      return 6;
    case "max":
      return 7;
    case "unlimited":
      return 8;
    case "enterprise":
      return 9;
    default:
      return -1;
  }
}

function getActivePlanFromCustomerData(customerData: any) {
  const products = Array.isArray(customerData?.products)
    ? customerData.products
    : [];
  const now = Date.now();

  const activePlans = products
    .filter((p: any) => {
      if (p?.is_add_on) return false;
      if (p?.status === "active" || p?.scenario === "active") return true;
      return !!(
        p?.canceled_at &&
        p?.current_period_end &&
        now < p.current_period_end
      );
    })
    .sort((a: any, b: any) => {
      const aTier = PLAN_ID_TO_TIER[a?.id] ?? inferTierFromPlanName(a?.name);
      const bTier = PLAN_ID_TO_TIER[b?.id] ?? inferTierFromPlanName(b?.name);
      return getTierRank(bTier) - getTierRank(aTier);
    });

  return activePlans[0] ?? null;
}

/**
 * Grant credits to a user by tracking negative usage
 * Only accessible to god-role users
 */
export const grantCreditsToUser = action({
  args: {
    clerkId: v.string(),
    featureId: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Negative amount = ADD credits (grant)
      // Positive amount = REMOVE credits (deduct)
      // trackUsage from lib/autumn-api.ts allows us to specify the exact customer ID
      const result = await trackUsage(
        args.clerkId,
        args.amount, // Can be negative (grant) or positive (deduct)
        args.featureId,
        {
          granted_by: "god_mode",
          action: args.amount < 0 ? "grant" : "deduct",
          reason: args.reason || "Manual credit modification",
          timestamp: Date.now(),
        },
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to modify credits");
      }

      const action = args.amount < 0 ? "Granted" : "Deducted";
      const absAmount = Math.abs(args.amount);
      console.log(
        `✅ ${action} ${absAmount} credits of ${args.featureId} ${args.amount < 0 ? "to" : "from"} ${args.clerkId}`,
        args.reason ? `Reason: ${args.reason}` : "",
      );

      return { success: true, result };
    } catch (error) {
      console.error("Failed to grant credits:", error);
      throw error;
    }
  },
});

/**
 * Search users by email or Clerk ID
 * Only accessible to god-role users
 */
export const searchUsersByEmail = query({
  args: {
    searchQuery: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Search users by email or clerk_id (case-insensitive)
    const searchLower = args.searchQuery.toLowerCase().trim();

    if (searchLower.length === 0) {
      return [];
    }

    // Get all users and filter by email or clerk_id
    const allUsers = await ctx.db.query("users").collect();

    const matchingUsers = allUsers
      .filter(
        (user) =>
          user.email?.toLowerCase().includes(searchLower) ||
          user.clerk_id?.toLowerCase().includes(searchLower),
      )
      .slice(0, 10) // Limit to 10 results
      .map((user) => ({
        _id: user._id,
        name: user.name || "Unknown",
        email: user.email || "",
        clerk_id: user.clerk_id,
      }));

    return matchingUsers;
  },
});

/**
 * Get project owner details
 */
export const getProjectOwner = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }

    // Use compound index for better performance - no filtering needed
    const ownerMembership = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_role", (q) =>
        q.eq("project", args.projectId).eq("project_role", "owner"),
      )
      .first();

    if (!ownerMembership) {
      return null;
    }

    // Get user details
    const owner = await ctx.db.get(ownerMembership.user);
    if (!owner) {
      return null;
    }

    return {
      _id: owner._id,
      name: owner.name || "Unknown",
      email: owner.email || "",
      clerk_id: owner.clerk_id,
    };
  },
});

/**
 * Get user by ID
 * Only accessible to god-role users
 */
// Internal cacheable version
export const getUserByIdInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get user directly from database
    const user = await ctx.db.get(args.userId);

    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      name: user.name || "Unknown",
      email: user.email || "",
      clerk_id: user.clerk_id,
    };
  },
});

export const getUserById = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    _id: Id<"users">;
    name: string;
    email: string;
    clerk_id: string;
  } | null> => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    return await ctx.runQuery(internal.admin.getUserByIdInternal, {
      userId: args.userId,
    });
  },
});

/**
 * Get user pause status
 * Returns active pause record if user is paused
 */
export const getUserPauseStatus = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Get pause status from internal query
    const pauseRecord = await ctx.db
      .query("paused_users")
      .withIndex("by_user_and_active", (q) =>
        q.eq("userId", args.userId).eq("active", true),
      )
      .first();

    // If paused, get the admin who paused them
    if (pauseRecord && pauseRecord.pausedBy) {
      const pausedByUser = await ctx.db.get(pauseRecord.pausedBy);
      return {
        ...pauseRecord,
        pausedByName: pausedByUser?.name || "Unknown",
        pausedByEmail: pausedByUser?.email || "",
      };
    }

    return pauseRecord;
  },
});

/**
 * Pause user deployments
 * Only accessible to god-role users
 */
export const pauseUserDeployments = action({
  args: {
    userId: v.id("users"),
    pauseReason: PAUSE_REASON_VALIDATOR,
    autoUnpauseEnabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Call internal action to pause all user deployments
      const result = await ctx.runAction(
        internal.deployment_management.pauseAllUserDeployments,
        {
          userId: args.userId,
          pauseReason: args.pauseReason,
          autoUnpauseEnabled: args.autoUnpauseEnabled,
          pausedBy: currentUser._id,
        },
      );

      console.log(
        `✅ Paused deployments for user ${args.userId}. Reason: ${args.pauseReason}`,
      );

      return result;
    } catch (error) {
      console.error("Failed to pause deployments:", error);
      throw error;
    }
  },
});

/**
 * Unpause user deployments
 * Only accessible to god-role users
 */
export const unpauseUserDeployments = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<any> => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Call internal action to unpause all user deployments (force bypasses manual pause check)
      const result = await ctx.runAction(
        internal.deployment_management.unpauseUserDeployments,
        {
          userId: args.userId,
          force: true,
        },
      );

      console.log(`✅ Unpaused deployments for user ${args.userId}`);

      return result;
    } catch (error) {
      console.error("Failed to unpause deployments:", error);
      throw error;
    }
  },
});

/**
 * Pause a single project's deployments
 * Only accessible to god-role users
 */
export const pauseProjectDeployment = action({
  args: {
    projectId: v.id("project"),
    pauseReason: PAUSE_REASON_VALIDATOR,
  },
  handler: async (ctx, args): Promise<any> => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      const result = await ctx.runAction(
        internal.deployment_helpers.pauseProjectDeployments,
        {
          projectId: args.projectId,
          pauseReason: args.pauseReason,
          pausedBy: currentUser._id,
        },
      );

      console.log(
        `✅ Paused deployments for project ${args.projectId}. Reason: ${args.pauseReason}`,
      );

      return result;
    } catch (error) {
      console.error("Failed to pause project deployments:", error);
      throw error;
    }
  },
});

/**
 * Unpause a single project's deployments
 * Only accessible to god-role users
 */
export const unpauseProjectDeployment = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<any> => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      const result = await ctx.runAction(
        internal.deployment_helpers.unpauseProjectDeployments,
        {
          projectId: args.projectId,
        },
      );

      console.log(`✅ Unpaused deployments for project ${args.projectId}`);

      return result;
    } catch (error) {
      console.error("Failed to unpause project deployments:", error);
      throw error;
    }
  },
});

/**
 * Get detailed user information including subscription and usage
 * Only accessible to god-role users
 */
export const getUserDetails = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<any> => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Get user from database
      const user = await ctx.runQuery(internal.users.get, {
        userId: args.userId,
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Resolve current tier/plan from Autumn when available.
      // This avoids stale legacy `users.tier` values in admin UI.
      let customerData: any = null;
      try {
        customerData = await getCustomerData(user.clerk_id);
      } catch (error) {
        console.warn(
          `Failed to load Autumn customer for ${user.clerk_id}, falling back to stored tier:`,
          error instanceof Error ? error.message : String(error),
        );
      }

      const resolvedTier =
        customerData && Array.isArray(customerData?.products)
          ? getTierFromCustomerData(customerData)
          : (user.tier ?? "free");
      const activePlan = getActivePlanFromCustomerData(customerData);
      const resolvedPlanId = activePlan?.id ?? null;
      const resolvedPlanName =
        activePlan?.name || TIER_LABELS[resolvedTier] || "Free";

      return {
        user: {
          _id: user._id,
          name: user.name || "Unknown",
          email: user.email || "",
          clerk_id: user.clerk_id,
          role: user.role,
          tier: resolvedTier,
          onboarding_completed: user.onboarding_completed,
          _creationTime: user._creationTime,
        },
        subscription: {
          tier: resolvedTier,
          planId: resolvedPlanId,
          planName: resolvedPlanName,
          source: customerData ? "autumn" : "database_fallback",
        },
        // TODO: Add usage stats from Autumn
        usage: null,
      };
    } catch (error) {
      console.error("Failed to get user details:", error);
      throw error;
    }
  },
});

/**
 * Credit types tracked in the system
 */
const CREDIT_TYPES = [
  { id: "agent_credits", name: "Agent Credits" },
  { id: "email_integration", name: "Email Credits" },
  { id: "llm_integration", name: "AI Credits" },
  { id: "convex_function_calls", name: "Convex Function Calls" },
  { id: "convex_compute", name: "Convex Compute GB-h" },
  { id: "convex_database_bw", name: "Convex Database BW GB" },
  { id: "convex_file_bw", name: "Convex File BW GB" },
] as const;

/**
 * Get all credit balances for a user
 * Only accessible to god-role users
 */
export const getUserCreditBalances = action({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Verify god role
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    try {
      // Get customer data from Autumn API
      // Wrap in try-catch to handle users that don't exist in Autumn yet
      let customerData;
      try {
        customerData = await getCustomerData(args.clerkId);
      } catch (error) {
        console.warn(
          `User ${args.clerkId} not found in Autumn (likely not created yet):`,
          error instanceof Error ? error.message : String(error),
        );
        customerData = null;
      }

      if (!customerData || !customerData.entitlements) {
        console.warn(
          "No customer data or entitlements found for:",
          args.clerkId,
        );
        // Return empty balances with dashes to indicate no data
        return {
          balances: CREDIT_TYPES.map((creditType) => ({
            featureId: creditType.id,
            name: creditType.name,
            balance: "-",
            used: "-",
            unlimited: false,
            allowed: false,
          })),
        };
      }

      // Convert entitlements array to a lookup object for easy access
      const entitlementsMap = new Map(
        customerData.entitlements.map((entitlement: any) => [
          entitlement.feature_id,
          entitlement,
        ]),
      );

      // Map feature balances from entitlements
      const balances = CREDIT_TYPES.map((creditType) => {
        const entitlement: any = entitlementsMap.get(creditType.id);

        if (entitlement) {
          // Get balance and used from the entitlement
          const balance = entitlement.balance ?? 0;
          const used = entitlement.used ?? 0;
          const unlimited = entitlement.unlimited ?? false;

          return {
            featureId: creditType.id,
            name: creditType.name,
            balance: unlimited ? "unlimited" : balance,
            used: unlimited ? 0 : used,
            unlimited: unlimited,
            allowed: unlimited || balance > 0,
          };
        }

        // Entitlement not found in customer data
        return {
          featureId: creditType.id,
          name: creditType.name,
          balance: 0,
          used: 0,
          unlimited: false,
          allowed: false,
        };
      });

      return { balances };
    } catch (error) {
      console.error("Failed to get user credit balances:", error);
      throw error;
    }
  },
});

/**
 * Get all members of a project
 * Only accessible to god-role users
 */
export const getProjectMembers = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Get all project members
    const projectMembers = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();

    // Fetch user details for each member
    const membersWithDetails = await Promise.all(
      projectMembers.map(async (pm) => {
        const user = await ctx.db.get(pm.user);
        return {
          _id: pm._id,
          userId: pm.user,
          userName: user?.name || "Unknown",
          userEmail: user?.email || "",
          role: pm.project_role,
          addedAt: pm._creationTime,
        };
      }),
    );

    return membersWithDetails;
  },
});

export const getProjectManagementBySemanticIdentifier = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getAuthUser(ctx);

    if (
      !currentUser ||
      (currentUser.role !== "god" && currentUser.role !== "admin")
    ) {
      throw new Error("Unauthorized: Admin access required");
    }

    const semanticIdentifier = args.semanticIdentifier.trim();

    if (!semanticIdentifier) {
      return null;
    }

    const project = await ctx.db
      .query("project")
      .withIndex("by_semantic_identifier", (q) =>
        q.eq("semantic_identifier", semanticIdentifier),
      )
      .unique();

    if (!project) {
      return null;
    }

    const projectMembers = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", project._id))
      .collect();

    const members = await Promise.all(
      projectMembers.map(async (membership) => {
        const user = await ctx.db.get(membership.user);

        return {
          _id: membership._id,
          userId: membership.user,
          userName: user?.name || "Unknown",
          userEmail: user?.email || "",
          role: membership.project_role,
          addedAt: membership._creationTime,
        };
      }),
    );

    return {
      project: {
        _id: project._id,
        name: project.name || project.semantic_identifier,
        semantic_identifier: project.semantic_identifier,
        state: project.state,
        deleted: !!project.deleted,
        _creationTime: project._creationTime,
      },
      members,
    };
  },
});

/**
 * Get project by deployment name
 * Only accessible to god-role users
 */
export const getProjectByDeploymentName = action({
  args: {
    deploymentName: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"project"> | null> => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Get project from internal query
    const project: Doc<"project"> | null = await ctx.runQuery(
      internal.project.getProjectByDeploymentName,
      {
        deploymentName: args.deploymentName,
      },
    );

    return project;
  },
});

/**
 * Get project pause status
 * Only accessible to god-role users
 */
export const getProjectPauseStatus = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Get pause status from internal query
    const pauseRecord = await ctx.db
      .query("paused_projects")
      .withIndex("by_project_and_active", (q) =>
        q.eq("projectId", args.projectId).eq("active", true),
      )
      .first();

    // If paused, get the admin who paused it
    if (pauseRecord && pauseRecord.pausedBy) {
      const pausedByUser = await ctx.db.get(pauseRecord.pausedBy);
      return {
        ...pauseRecord,
        pausedByName: pausedByUser?.name || "Unknown",
        pausedByEmail: pausedByUser?.email || "",
      };
    }

    return pauseRecord;
  },
});

/**
 * Get project pause status (action wrapper for dynamic calls)
 * Only accessible to god-role users
 */
export const getProjectPauseStatusAction = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | (Doc<"paused_projects"> & {
        pausedByName?: string;
        pausedByEmail?: string;
      })
    | null
  > => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Get pause status from internal query
    const pauseRecord: Doc<"paused_projects"> | null = await ctx.runQuery(
      internal.deployment_queries.getProjectPauseStatusInternal,
      {
        projectId: args.projectId,
      },
    );

    // If paused, get the admin who paused it
    if (pauseRecord && pauseRecord.pausedBy) {
      const pausedByUser: Doc<"users"> | null = await ctx.runQuery(
        internal.users.get,
        {
          userId: pauseRecord.pausedBy,
        },
      );
      return {
        ...pauseRecord,
        pausedByName: pausedByUser?.name || "Unknown",
        pausedByEmail: pausedByUser?.email || "",
      };
    }

    return pauseRecord;
  },
});

/**
 * Batch fetch deployment pause statuses for multiple deployments
 * Returns a map of deployment names to their pause status and project ID
 * Only accessible to god-role users
 */
export const getBatchDeploymentPauseStatuses = action({
  args: {
    deploymentNames: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{ deploymentName: string; paused: boolean; projectId: string | null }>
  > => {
    // Single auth check for the entire batch
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Result array
    const results: Array<{
      deploymentName: string;
      paused: boolean;
      projectId: string | null;
    }> = [];

    // Batch lookup all projects in parallel
    const projectLookups = await Promise.all(
      args.deploymentNames.map(async (deploymentName) => {
        try {
          const project = await ctx.runQuery(
            internal.project.getProjectByDeploymentName,
            { deploymentName },
          );
          return { deploymentName, project };
        } catch (error) {
          console.error(
            `Failed to lookup project for ${deploymentName}:`,
            error,
          );
          return { deploymentName, project: null };
        }
      }),
    );

    // Separate projects into found and not found
    const foundProjects = projectLookups.filter(
      (lookup) => lookup.project !== null,
    );
    const notFoundDeployments = projectLookups
      .filter((lookup) => lookup.project === null)
      .map((lookup) => lookup.deploymentName);

    // Batch fetch pause statuses for all found projects in parallel
    // Check both paused_projects (manual/project-level pause) and
    // paused_users (auto-pause when usage limits exceeded)
    const pauseStatusLookups = await Promise.all(
      foundProjects.map(async (lookup) => {
        try {
          // Check project-level pause
          const projectPauseStatus = await ctx.runQuery(
            internal.deployment_queries.getProjectPauseStatusInternal,
            { projectId: lookup.project!._id },
          );

          if (projectPauseStatus?.active) {
            return {
              deploymentName: lookup.deploymentName,
              projectId: lookup.project!._id,
              paused: true,
            };
          }

          // Check user-level pause (auto-pause writes to paused_users, not paused_projects)
          const ownerInfo = await ctx.runQuery(
            internal.project.getProjectOwner,
            { projectId: lookup.project!._id },
          );

          if (ownerInfo && ownerInfo.type === "user" && ownerInfo.user) {
            const ownerUser = await ctx.runQuery(
              internal.users.getUserByClerkId,
              { clerkId: ownerInfo.user.clerk_id },
            );
            if (ownerUser) {
              const userPauseStatus = await ctx.runQuery(
                internal.deployment_queries.getUserPauseStatusInternal,
                { userId: ownerUser._id },
              );
              if (userPauseStatus?.active) {
                return {
                  deploymentName: lookup.deploymentName,
                  projectId: lookup.project!._id,
                  paused: true,
                };
              }
            }
          }

          return {
            deploymentName: lookup.deploymentName,
            projectId: lookup.project!._id,
            paused: false,
          };
        } catch (error) {
          console.error(
            `Failed to fetch pause status for ${lookup.deploymentName}:`,
            error,
          );
          return {
            deploymentName: lookup.deploymentName,
            projectId: lookup.project!._id,
            paused: false,
          };
        }
      }),
    );

    // Add all found projects with pause status
    results.push(...pauseStatusLookups);

    // Add all not found deployments with null project ID
    results.push(
      ...notFoundDeployments.map((deploymentName) => ({
        deploymentName,
        paused: false,
        projectId: null,
      })),
    );

    return results;
  },
});

/**
 * Get all projects for a user
 * Only accessible to god-role users
 */
export const getUserProjects = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Get all projects where the user is a member
    const projectMemberships = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Fetch project details for each membership
    const projectsWithDetails = await Promise.all(
      projectMemberships.map(async (pm) => {
        const project = await ctx.db.get(pm.project);
        if (!project) return null;

        return {
          _id: project._id,
          name: project.name || project.semantic_identifier,
          semantic_identifier: project.semantic_identifier,
          role: pm.project_role,
          createdAt: project._creationTime,
        };
      }),
    );

    // Filter out null values and sort by creation time
    return projectsWithDetails
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get deployment details for a project
 * Only accessible to god-role users
 */
// Internal cacheable version
export const getProjectDeploymentDetailsInternal = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    hasConvex: boolean;
    isSelfHosted: boolean;
    daytonaServer?: "legacy" | "new";
    project: {
      name: string;
      sandbox_id: string | null | undefined;
      semantic_identifier: string;
      packageManager: "pnpm" | "bun";
    };
    convex?: {
      devDeploymentName: string;
      prodDeploymentName: string | null;
      convexProjectId: number;
      devDeploymentUrl: string;
      prodDeploymentUrl: string | null;
    };
  } | null> => {
    // Get project
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }

    const daytonaMigration: Doc<"daytona_migration"> | null = await ctx.runQuery(
      internal.project.getProjectDaytonaMigration,
      {
        projectId: args.projectId,
      },
    );

    // Check if project is self-hosted
    const selfHostedConnection = await ctx.db
      .query("convex_connections")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("is_active"), true))
      .first();
    const isSelfHosted = !!selfHostedConnection;

    // Get the convex instance for this project
    const convexInstance = await ctx.db
      .query("project_convex_instance")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!convexInstance) {
      return {
        hasConvex: false,
        isSelfHosted,
        daytonaServer: daytonaMigration?.daytona_server,
        project: {
          name: project.name || project.semantic_identifier,
          sandbox_id: project.sandbox_id,
          semantic_identifier: project.semantic_identifier,
          packageManager: project.packageManager || "pnpm",
        },
      };
    }

    return {
      hasConvex: true,
      isSelfHosted,
      daytonaServer: daytonaMigration?.daytona_server,
      project: {
        name: project.name || project.semantic_identifier,
        sandbox_id: project.sandbox_id,
        semantic_identifier: project.semantic_identifier,
        packageManager: project.packageManager || "pnpm",
      },
      convex: {
        devDeploymentName: convexInstance.devDeploymentName,
        prodDeploymentName: convexInstance.prodDeploymentName,
        convexProjectId: convexInstance.convexProjectId,
        devDeploymentUrl: `https://dashboard.convex.dev/d/${convexInstance.devDeploymentName}/`,
        prodDeploymentUrl: convexInstance.prodDeploymentName
          ? `https://dashboard.convex.dev/d/${convexInstance.prodDeploymentName}/`
          : null,
      },
    };
  },
});

export const getProjectDeploymentDetails = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    hasConvex: boolean;
    isSelfHosted: boolean;
    daytonaServer?: "legacy" | "new";
    project: {
      name: string;
      sandbox_id: string | null | undefined;
      semantic_identifier: string;
      packageManager: "pnpm" | "bun";
    };
    convex?: {
      devDeploymentName: string;
      prodDeploymentName: string | null;
      convexProjectId: number;
      devDeploymentUrl: string;
      prodDeploymentUrl: string | null;
    };
  } | null> => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    return await ctx.runQuery(
      internal.admin.getProjectDeploymentDetailsInternal,
      {
        projectId: args.projectId,
      },
    );
  },
});

/**
 * Get platform-wide statistics (internal cacheable version)
 * This version has no auth check and can be cached by Convex
 */
export const getPlatformStatisticsInternal = internalQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    users: {
      total: number;
      active24h: number;
      active7d: number;
      active30d: number;
      recentSignups: number;
      godUsers: number;
      freeUsers: number;
      paidUsers: number;
    };
    projects: {
      total: number;
    };
    convexProjects: {
      total: number;
      active: number;
      paused: number;
    };
  }> => {
    // OPTIMIZATION: Run all aggregate count operations in parallel for maximum performance
    // This reduces sequential database round trips and improves query time significantly
    const [
      totalUsers,
      totalProjects,
      totalDeployments,
      godUsers,
      freeUsers,
      paidUsers,
      pausedProjectsCount,
      pausedUsersCount,
      dayCounts,
    ] = await Promise.all([
      // Use aggregates for efficient counting
      allUsers.count(ctx, { bounds: {} }),
      allProjects.count(ctx, { bounds: {} }),
      allConvexInstances.count(ctx, { bounds: {} }),

      // Count users by role
      usersByRole.count(ctx, { bounds: { prefix: ["god"] } }),

      // Count users by tier
      usersByTier.count(ctx, { bounds: { prefix: ["free"] } }),
      usersByTier.count(ctx, { bounds: { prefix: ["pro"] } }),

      // Count paused projects and users (only active ones)
      pausedProjectsByActive.count(ctx, { bounds: { prefix: ["true"] } }),
      pausedUsersByActive.count(ctx, { bounds: { prefix: ["true"] } }),

      // Calculate recent signups and active users using countBatch for optimal performance
      // Note: Active users metrics (24h, 7d, 30d) currently use _creationTime as proxy
      // since we don't have last_login tracking yet
      // TODO: Add last_login tracking for accurate active user metrics
      //
      // Use countBatch to execute all 30 day queries in a single database round trip
      // This replaces 45 sequential queries with 1 batched query (massive performance win)
      usersByDay.countBatch(
        ctx,
        Array.from({ length: 30 }, (_, i) => ({
          bounds: { prefix: [getDayKeyForDaysAgo(i)] },
        })),
      ),
    ]);

    // Approximate paused deployments
    const pausedDeploymentCount = pausedProjectsCount + pausedUsersCount;
    const activeDeploymentCount = Math.max(
      0,
      totalDeployments - pausedDeploymentCount,
    );

    // OPTIMIZATION: Use helper function to compute rolling windows efficiently
    const { total24h, total7d, total30d } = computeRollingWindows(dayCounts);
    const recentSignups = total7d; // Same as 7d for signups

    return {
      users: {
        total: totalUsers,
        active24h: total24h,
        active7d: total7d,
        active30d: total30d,
        recentSignups,
        godUsers,
        freeUsers,
        paidUsers,
      },
      projects: {
        total: totalProjects,
      },
      convexProjects: {
        total: totalDeployments,
        active: activeDeploymentCount,
        paused: pausedDeploymentCount,
      },
    };
  },
});

/**
 * Get platform-wide statistics
 * Only accessible to god-role users
 */
export const getPlatformStatistics = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    users: {
      total: number;
      active24h: number;
      active7d: number;
      active30d: number;
      recentSignups: number;
      godUsers: number;
      freeUsers: number;
      paidUsers: number;
    };
    projects: {
      total: number;
    };
    convexProjects: {
      total: number;
      active: number;
      paused: number;
    };
  }> => {
    // Check if user is a god
    const currentUser = await getAuthUser(ctx);

    if (!currentUser || currentUser.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    // Delegate to internal query for automatic Convex caching
    return await ctx.runQuery(internal.admin.getPlatformStatisticsInternal);
  },
});
