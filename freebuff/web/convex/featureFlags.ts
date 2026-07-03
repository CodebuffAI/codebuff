import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUser } from "./users";
import { Doc } from "./_generated/dataModel";

/**
 * Feature flag keys used throughout the application
 * Note: Most feature flags have been removed as features are now always enabled.
 * Only organizations_enabled remains as an active feature flag.
 */
export const FEATURE_FLAGS = {
  ORGANIZATIONS: "organizations_enabled",
  REFERRALS: "referrals_enabled",
  USAGE_TAB: "usage_tab_enabled",
  STATS_MONITORING_ENABLED: "stats_monitoring_enabled",
  BILLING_ENFORCEMENT: "billing_enforcement",
  // Gates the WebContainer-backed project creation path (in-browser
  // sandboxing) as a replacement for Daytona pooled sandboxes. Defaults to
  // DISABLED so production /web keeps creating Daytona projects. Admins can
  // test WebContainer via /web/test (explicit opt-in in codesandbox.create),
  // or the flag can be enabled later via a DB record / env var for rollout.
  WEBCONTAINER_PROJECTS: "webcontainer_projects_enabled",
  // Add more feature flags as needed
} as const;

/**
 * Flags that are enabled by default when no DB record or env var is present.
 * Everything not listed here defaults to false (safe/off).
 */
const FEATURE_DEFAULTS: Record<string, boolean> = {
  [FEATURE_FLAGS.WEBCONTAINER_PROJECTS]: false,
};

/**
 * Simple deterministic hash function for percentage-based rollouts
 * Uses a combination of user ID and flag key to ensure consistent rollout behavior
 */
function simpleHash(userId: string, flagKey: string): number {
  const combined = `${userId}:${flagKey}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Evaluate if a user has access to a feature based on the flag's rollout strategy
 */
function evaluateFeatureAccess(
  user: Doc<"users"> | null,
  flag: Doc<"feature_flags">,
): boolean {
  const { rollout_strategy, rollout_percentage } = flag;

  switch (rollout_strategy) {
    case "disabled":
      return false;

    case "god_only":
      return user?.role === "god";

    case "beta":
      return user?.role === "god" || user?.is_beta === true;

    case "percentage":
      if (!user) return false;
      // God and beta users always get access
      if (user.role === "god" || user.is_beta === true) {
        return true;
      }
      // For other users, use deterministic hashing
      if (rollout_percentage === undefined || rollout_percentage === null) {
        return false; // No percentage set, deny access
      }
      const hash = simpleHash(user._id, flag.key);
      const userPercentile = hash % 100;
      return userPercentile < rollout_percentage;

    case "enabled":
      return true;

    default:
      return false;
  }
}

/**
 * Check if a feature is enabled for the current user (or a specified user)
 * Falls back to environment variable if not in database
 *
 * @param userId - Optional user ID to check feature flag for. If not provided, uses authenticated user.
 *                 Useful in scheduled functions where auth context is not available.
 */
export const isEnabled = internalQuery({
  args: {
    key: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get the user - either from provided userId or authenticated context
    let user: Doc<"users"> | null = null;

    if (args.userId) {
      // Fetch user directly by ID (for scheduled functions)
      user = await ctx.db.get(args.userId);
    } else {
      // Get authenticated user (for normal queries/mutations)
      user = await getAuthUser(ctx);
    }

    // First check database
    const flag = await ctx.db
      .query("feature_flags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (flag !== null) {
      return evaluateFeatureAccess(user, flag);
    }

    // Fallback to environment variable (legacy support)
    // Convert key to env var format: billing_enforcement -> FEATURE_BILLING_ENFORCEMENT
    const envKey = `FEATURE_${args.key.toUpperCase()}`;
    const envValue = process.env[envKey];

    // Explicit env var wins; otherwise fall back to per-flag default.
    if (envValue !== undefined) return envValue === "true";
    return FEATURE_DEFAULTS[args.key] ?? false;
  },
});

/**
 * Batch check if multiple features are enabled for the current user (or a specified user)
 * More efficient than multiple individual isEnabled calls
 *
 * @param keys - Array of feature flag keys to check
 * @param userId - Optional user ID to check feature flags for. If not provided, uses authenticated user.
 * @returns Record mapping each key to its enabled status
 */
export const batchIsEnabled = internalQuery({
  args: {
    keys: v.array(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get the user - either from provided userId or authenticated context
    let user: Doc<"users"> | null = null;

    if (args.userId) {
      // Fetch user directly by ID (for scheduled functions)
      user = await ctx.db.get(args.userId);
    } else {
      // Get authenticated user (for normal queries/mutations)
      user = await getAuthUser(ctx);
    }

    // Fetch all feature flags from database in one query
    const allFlags = await ctx.db.query("feature_flags").collect();
    const flagsMap = new Map(allFlags.map((flag) => [flag.key, flag]));

    // Build result map for each requested key
    const result: Record<string, boolean> = {};

    for (const key of args.keys) {
      const flag = flagsMap.get(key);

      if (flag !== null && flag !== undefined) {
        // Use database flag
        result[key] = evaluateFeatureAccess(user, flag);
      } else {
        // Fallback to environment variable, then per-flag default.
        const envKey = `FEATURE_${key.toUpperCase()}`;
        const envValue = process.env[envKey];
        result[key] =
          envValue !== undefined
            ? envValue === "true"
            : (FEATURE_DEFAULTS[key] ?? false);
      }
    }

    console.log(
      `[FeatureFlags] Batch check for user ${args.userId || "authenticated"}:`,
      result,
    );

    return result;
  },
});

// Internal cacheable version - accepts clerkId to enable caching
export const checkFeatureInternal = internalQuery({
  args: {
    key: v.string(),
    clerkId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    enabled: boolean;
    description?: string;
    rollout_strategy:
      | "disabled"
      | "god_only"
      | "beta"
      | "percentage"
      | "enabled";
    rollout_percentage?: number;
  }> => {
    // Get user if clerkId provided
    let user: Doc<"users"> | null = null;
    if (args.clerkId !== undefined) {
      const clerkId = args.clerkId;
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", clerkId))
        .unique();
    }

    // First check database
    const flag = await ctx.db
      .query("feature_flags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (flag !== null) {
      const enabled = evaluateFeatureAccess(user, flag);
      return {
        enabled,
        description: flag.description,
        rollout_strategy: flag.rollout_strategy,
        rollout_percentage: flag.rollout_percentage,
      };
    }

    // Fallback to environment variable, then per-flag default.
    const envKey = `FEATURE_${args.key.toUpperCase()}`;
    const envValue = process.env[envKey];
    const effectiveEnabled =
      envValue !== undefined
        ? envValue === "true"
        : (FEATURE_DEFAULTS[args.key] ?? false);

    return {
      enabled: effectiveEnabled,
      description:
        envValue !== undefined
          ? `Controlled by ${envKey} environment variable`
          : `Default value for ${args.key}`,
      rollout_strategy: effectiveEnabled
        ? ("enabled" as const)
        : ("disabled" as const),
      rollout_percentage: undefined,
    };
  },
});

/**
 * Public query to check if a feature is enabled for the current user
 * Can be called from frontend
 */
export const checkFeature = query({
  args: {
    key: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    enabled: boolean;
    description?: string;
    rollout_strategy:
      | "disabled"
      | "god_only"
      | "beta"
      | "percentage"
      | "enabled";
    rollout_percentage?: number;
  }> => {
    // Get JWT identity once
    const identity = await ctx.auth.getUserIdentity();

    // Delegate to internal cached version
    return await ctx.runQuery(internal.featureFlags.checkFeatureInternal, {
      key: args.key,
      clerkId: identity?.subject ?? undefined,
    });
  },
});

/**
 * Get all feature flags
 */
export const getAllFlags = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: Admin access required");
    }

    const flags = await ctx.db.query("feature_flags").collect();
    return flags;
  },
});

/**
 * Set a feature flag value
 * Requires god role authentication
 */
export const setFlag = mutation({
  args: {
    key: v.string(),
    rollout_strategy: v.union(
      v.literal("disabled"),
      v.literal("god_only"),
      v.literal("beta"),
      v.literal("percentage"),
      v.literal("enabled"),
    ),
    rollout_percentage: v.optional(v.number()),
    description: v.optional(v.string()),
    categories: v.optional(v.array(v.string())),
    runbook: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require god role for flag modifications
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error(
        "Unauthorized: God role required to modify feature flags",
      );
    }

    // Validate percentage if strategy is "percentage"
    if (args.rollout_strategy === "percentage") {
      if (
        args.rollout_percentage === undefined ||
        args.rollout_percentage < 0 ||
        args.rollout_percentage > 100
      ) {
        throw new Error(
          "rollout_percentage must be between 0 and 100 when strategy is 'percentage'",
        );
      }
    }

    const userId = user._id;

    // Check if flag exists
    const existingFlag = await ctx.db
      .query("feature_flags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    const now = Date.now();

    if (existingFlag) {
      // Update existing flag
      await ctx.db.patch(existingFlag._id, {
        rollout_strategy: args.rollout_strategy,
        rollout_percentage: args.rollout_percentage,
        description: args.description,
        categories: args.categories,
        runbook: args.runbook,
        updated_at: now,
        updated_by: userId,
      });
      return {
        ...existingFlag,
        rollout_strategy: args.rollout_strategy,
        rollout_percentage: args.rollout_percentage,
        updated_at: now,
      };
    } else {
      // Create new flag
      const flagId = await ctx.db.insert("feature_flags", {
        key: args.key,
        rollout_strategy: args.rollout_strategy,
        rollout_percentage: args.rollout_percentage,
        description: args.description,
        categories: args.categories,
        runbook: args.runbook,
        updated_at: now,
        updated_by: userId,
      });
      return {
        _id: flagId,
        key: args.key,
        rollout_strategy: args.rollout_strategy,
        rollout_percentage: args.rollout_percentage,
      };
    }
  },
});

/**
 * Delete a feature flag
 * Requires god role authentication
 */
export const deleteFlag = mutation({
  args: {
    flagId: v.id("feature_flags"),
  },
  handler: async (ctx, args) => {
    // Require god role for flag deletion
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error(
        "Unauthorized: God role required to delete feature flags",
      );
    }

    console.log(`User ${user.email} deleting feature flag ${args.flagId}`);

    await ctx.db.delete(args.flagId);
    return { success: true };
  },
});

/**
 * Toggle beta status for a user
 * Users can toggle their own beta status
 * God role required to toggle other users' beta status
 */
export const toggleUserBeta = mutation({
  args: {
    userId: v.id("users"),
    isBeta: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized: Must be signed in");
    }

    // Users can toggle their own beta status
    // God role required to toggle other users' beta status
    const isTogglingOwnStatus = user._id === args.userId;
    if (!isTogglingOwnStatus && user.role !== "god") {
      throw new Error(
        "Unauthorized: God role required to modify other users' beta status",
      );
    }

    console.log(
      `User ${user.email} setting beta status for user ${args.userId} to ${args.isBeta}`,
    );

    await ctx.db.patch(args.userId, {
      is_beta: args.isBeta,
    });

    return { success: true, userId: args.userId, isBeta: args.isBeta };
  },
});
