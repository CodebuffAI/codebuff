import { internalMutation, internalQuery } from "../../_generated/server";
import { v } from "convex/values";

/**
 * Sync status management - consolidated from syncStatus.ts, syncStatusQueries.ts, and syncStatusMutations.ts
 */

/**
 * Update sync status
 */
export const updateSyncStatus = internalMutation({
  args: {
    projectId: v.id("project"),
    status: v.union(
      v.literal("synced"),
      v.literal("pending"),
      v.literal("error"),
      v.literal("conflict"),
    ),
    lastSyncTime: v.number(),
    errorMessage: v.optional(v.string()),
    lastCommitHash: v.optional(v.string()),
    conflictResolvedAt: v.optional(v.number()),
    conflictResolvedBy: v.optional(v.id("users")),
    conflictFiles: v.optional(
      v.array(
        v.object({
          file_path: v.string(),
          github_content: v.string(),
          vly_content: v.string(),
          diff_view: v.string(),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const syncState = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    if (syncState) {
      const updateData: any = {
        sync_status: args.status,
        last_sync_time: args.lastSyncTime,
        error_message: args.errorMessage,
        ...(args.lastCommitHash && { last_commit_hash: args.lastCommitHash }),
      };

      // Add conflict-related fields if provided
      if (args.conflictResolvedAt !== undefined) {
        updateData.conflict_resolved_at = args.conflictResolvedAt;
      }
      if (args.conflictResolvedBy !== undefined) {
        updateData.conflict_resolved_by = args.conflictResolvedBy;
      }

      await ctx.db.patch(syncState._id, updateData);

      console.log("Sync status updated:", {
        projectId: args.projectId,
        status: args.status,
        lastSyncTime: new Date(args.lastSyncTime).toISOString(),
        errorMessage: args.errorMessage,
        lastCommitHash: args.lastCommitHash,
        conflictFilesCount: args.conflictFiles?.length || 0,
      });
    } else {
      console.log("No sync state found for project:", args.projectId);
    }

    return null;
  },
});

/**
 * Create new sync state record
 */
export const createSyncState = internalMutation({
  args: {
    projectId: v.id("project"),
    repoOwner: v.string(),
    repoName: v.string(),
    syncDirection: v.literal("bidirectional"),
    status: v.union(
      v.literal("synced"),
      v.literal("pending"),
      v.literal("error"),
      v.literal("conflict"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Check if sync state already exists
    const existingSync = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    if (existingSync) {
      // Update existing sync state
      await ctx.db.patch(existingSync._id, {
        github_repo_name: args.repoName,
        github_repo_owner: args.repoOwner,
        sync_direction: args.syncDirection,
        sync_status: args.status,
        last_sync_time: Date.now(),
        error_message: undefined,
      });
    } else {
      // Create new sync state
      await ctx.db.insert("github_sync_state", {
        project_id: args.projectId,
        github_repo_name: args.repoName,
        github_repo_owner: args.repoOwner,
        last_sync_time: Date.now(),
        sync_direction: args.syncDirection,
        sync_status: args.status,
      });
    }

    return null;
  },
});

/**
 * Check if a project has unresolved conflicts
 */
export const hasUnresolvedConflicts = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const syncState = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    if (!syncState) {
      return false;
    }

    // Check if status is conflict
    if (syncState.sync_status === "conflict") {
      return true;
    }

    return false;
  },
});
