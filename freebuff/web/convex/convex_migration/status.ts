import { v } from "convex/values";
import { internalMutation, query, mutation } from "../_generated/server";
import { getAuthUser } from "!/users";

/**
 * Migration status type
 */
export const migrationStatusValidator = v.union(
  v.literal("initiated"),
  v.literal("exporting"),
  v.literal("importing"),
  v.literal("updating_credentials"),
  v.literal("completed"),
  v.literal("failed"),
);

/**
 * Create a new migration record (internal only)
 */
export const createMigration = internalMutation({
  args: {
    projectId: v.id("project"),
    user_id: v.id("users"),
    source_dev_deployment: v.string(),
    source_prod_deployment: v.optional(v.string()),
    target_convex_project_id: v.optional(v.number()),
    target_team_slug: v.optional(v.string()),
    target_dev_deployment: v.string(),
    target_prod_deployment: v.optional(v.string()),
  },
  returns: v.id("convex_migrations"),
  handler: async (ctx, args) => {
    const migrationId = await ctx.db.insert("convex_migrations", {
      projectId: args.projectId,
      user_id: args.user_id,
      status: "initiated",
      progress_percentage: 0,
      source_dev_deployment: args.source_dev_deployment,
      source_prod_deployment: args.source_prod_deployment,
      target_convex_project_id: args.target_convex_project_id,
      target_team_slug: args.target_team_slug,
      target_dev_deployment: args.target_dev_deployment,
      target_prod_deployment: args.target_prod_deployment,
      started_at: Date.now(),
    });

    console.log("[Migration] Created:", {
      migrationId,
      projectId: args.projectId,
    });

    return migrationId;
  },
});

/**
 * Update migration status and progress (internal only)
 */
export const updateMigrationStatus = internalMutation({
  args: {
    migrationId: v.id("convex_migrations"),
    status: migrationStatusValidator,
    progress_percentage: v.optional(v.number()),
    tables_exported: v.optional(v.array(v.string())),
    total_documents_exported: v.optional(v.number()),
    total_documents_imported: v.optional(v.number()),
    error_message: v.optional(v.string()),
    error_details: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { migrationId, ...updates } = args;

    // If status is completed or failed, set completed_at timestamp
    const additionalUpdates: any = {};
    if (updates.status === "completed" || updates.status === "failed") {
      additionalUpdates.completed_at = Date.now();
    }

    await ctx.db.patch(migrationId, {
      ...updates,
      ...additionalUpdates,
    });

    console.log("[Migration] Updated:", {
      migrationId,
      status: updates.status,
      progress: updates.progress_percentage,
    });
  },
});

/**
 * Get migration status for a project (public - user can view their own)
 */
export const getMigrationStatus = query({
  args: {
    projectId: v.id("project"),
  },
  returns: v.union(
    v.object({
      _id: v.id("convex_migrations"),
      projectId: v.id("project"),
      status: migrationStatusValidator,
      progress_percentage: v.number(),
      tables_exported: v.optional(v.array(v.string())),
      total_documents_exported: v.optional(v.number()),
      total_documents_imported: v.optional(v.number()),
      error_message: v.optional(v.string()),
      started_at: v.number(),
      completed_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    // Get the most recent migration for this project
    const migration = await ctx.db
      .query("convex_migrations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc") // Most recent first
      .first();

    if (!migration || migration.user_id !== user._id) {
      return null;
    }

    return {
      _id: migration._id,
      projectId: migration.projectId,
      status: migration.status,
      progress_percentage: migration.progress_percentage,
      tables_exported: migration.tables_exported,
      total_documents_exported: migration.total_documents_exported,
      total_documents_imported: migration.total_documents_imported,
      error_message: migration.error_message,
      started_at: migration.started_at,
      completed_at: migration.completed_at,
    };
  },
});

/**
 * Cancel an in-progress migration (public)
 */
export const cancelMigration = mutation({
  args: {
    migrationId: v.id("convex_migrations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const migration = await ctx.db.get(args.migrationId);
    if (!migration || migration.user_id !== user._id) {
      throw new Error("Migration not found or unauthorized");
    }

    // Can only cancel if not already completed or failed
    if (migration.status === "completed" || migration.status === "failed") {
      throw new Error("Cannot cancel a completed or failed migration");
    }

    await ctx.db.patch(args.migrationId, {
      status: "failed",
      error_message: "Cancelled by user",
      completed_at: Date.now(),
    });

    console.log("[Migration] Cancelled:", args.migrationId);
  },
});

/**
 * Update project_convex_instance after migration (for paid users)
 */
export const updateConvexInstanceForMigration = internalMutation({
  args: {
    projectId: v.id("project"),
    devDeploymentName: v.string(),
    prodDeploymentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db
      .query("project_convex_instance")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!instance) {
      throw new Error("Convex instance not found");
    }

    await ctx.db.patch(instance._id, {
      devDeploymentName: args.devDeploymentName,
      prodDeploymentName: args.prodDeploymentName || null,
    });
  },
});
