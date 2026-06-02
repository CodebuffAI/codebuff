import { v } from "convex/values";
import { query } from "../../_generated/server";
import { getAuthUser } from "../../users";

/**
 * Get GitHub sync usage information for the current user
 * Returns connected GitHub account, list of projects with active syncs, and feature access status
 */
export const getGitHubSyncUsage = query({
  args: {
    hasGitHubIntegrationAccess: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      connection: v.union(
        v.object({
          github_username: v.string(),
          created_at: v.number(),
        }),
        v.null(),
      ),
      active_syncs: v.array(
        v.object({
          project_id: v.id("project"),
          project_name: v.string(),
          semantic_identifier: v.string(),
          repo_owner: v.string(),
          repo_name: v.string(),
          sync_status: v.union(
            v.literal("synced"),
            v.literal("pending"),
            v.literal("error"),
            v.literal("conflict"),
          ),
          last_sync_time: v.number(),
        }),
      ),
      has_feature_access: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    // Get GitHub connection
    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    // Get all project memberships for the user
    const projectMembers = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", user._id))
      .collect();

    // Batch fetch all projects in parallel
    const projects = await Promise.all(
      projectMembers.map((pm) => ctx.db.get(pm.project)),
    );

    // Filter out null/deleted projects and get their sync states in parallel
    const validProjects = projects.filter(
      (project) => project && !project.deleted,
    );

    const syncStates = await Promise.all(
      validProjects.map((project) =>
        ctx.db
          .query("github_sync_state")
          .withIndex("by_project", (q) => q.eq("project_id", project!._id))
          .first(),
      ),
    );

    // Build active syncs list from projects that have sync states
    const activeSyncs = validProjects
      .map((project, index) => {
        const syncState = syncStates[index];
        if (!syncState || !project) return null;

        return {
          project_id: project._id,
          project_name: project.name || project.semantic_identifier,
          semantic_identifier: project.semantic_identifier,
          repo_owner: syncState.github_repo_owner,
          repo_name: syncState.github_repo_name,
          sync_status: syncState.sync_status,
          last_sync_time: syncState.last_sync_time,
        };
      })
      .filter((sync) => sync !== null);

    return {
      connection: connection
        ? {
            github_username: connection.github_username,
            created_at: connection.created_at,
          }
        : null,
      active_syncs: activeSyncs,
      has_feature_access: args.hasGitHubIntegrationAccess ?? true, // Default to true for backwards compatibility
    };
  },
});
