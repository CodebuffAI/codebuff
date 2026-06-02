"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";

/**
 * Manual Git Sync Action
 *
 * Allows godmode users to manually trigger a sync
 * between the project and its GitHub repository.
 */
export const triggerManualSync = action({
  args: {
    projectId: v.id("project"),
    syncDirection: v.optional(
      v.union(v.literal("github_to_project"), v.literal("project_to_github")),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    syncStatus: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    syncStatus?: string;
    error?: string;
  }> => {
    console.log("Triggering manual sync");
    const { projectId, syncDirection = "project_to_github" } = args;

    try {
      // Get the current user
      const user = await getAuthUser(ctx);
      if (!user) {
        return {
          success: false,
          message: "User not authenticated",
        };
      }

      // Check if user is godmode
      if (user.role !== "god") {
        return {
          success: false,
          message: "Only godmode users can trigger manual sync",
        };
      }

      // Get project details
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId,
      });

      if (!project) {
        return {
          success: false,
          message: "Project not found",
        };
      }

      // Get GitHub connection details
      const projectContext = await ctx.runAction(
        internal.github.services.projectService.getProjectConnection,
        {
          projectId,
        },
      );

      if (!projectContext.success || !projectContext.connection) {
        return {
          success: false,
          message: "GitHub connection not found for this project",
          error: projectContext.error,
        };
      }

      const connection = projectContext.connection;

      if (!connection.repository_name || !connection.repository_owner) {
        return {
          success: false,
          message: "Repository details not found",
        };
      }

      // Get GitHub access token
      const githubAuth = await ctx.runQuery(
        internal.github.auth.getGitHubConnectionWithTokensInternal,
        {
          userId: user._id,
        },
      );

      if (!githubAuth?.access_token) {
        return {
          success: false,
          message: "GitHub authentication not found. Please reconnect GitHub.",
        };
      }

      console.log(
        `[ManualSync] Triggering ${syncDirection} sync for project ${projectId} to ${connection.repository_owner}/${connection.repository_name}`,
      );

      // Fetch GitHub token once for this sync flow
      console.log(
        `[ManualSync] Fetching GitHub token for project ${projectId}`,
      );
      const tokenResult = await ctx.runAction(
        internal.github.tokens.service.getGitHubToken,
        {
          operation: {
            type: syncDirection,
            projectId,
            accessToken: githubAuth.access_token,
            installationId: connection.installation_id,
          },
          operationName: "manual_sync",
        },
      );

      // Call the appropriate executor service directly (it handles status updates internally)
      const syncResult =
        syncDirection === "github_to_project"
          ? await ctx.runAction(
              internal.github.sync.services.syncExecutorService
                .executeGitHubToProjectSync,
              {
                sandboxId: project.sandbox_id,
                projectId,
                repoOwner: connection.repository_owner,
                repoName: connection.repository_name,
                accessToken: githubAuth.access_token,
                installationId: connection.installation_id,
                githubToken: tokenResult.token,
                githubTokenType: tokenResult.tokenType,
                packageManager: project.packageManager,
              },
            )
          : await ctx.runAction(
              internal.github.sync.services.syncExecutorService
                .executeProjectToGitHubSync,
              {
                sandboxId: project.sandbox_id,
                projectId,
                repoOwner: connection.repository_owner,
                repoName: connection.repository_name,
                accessToken: githubAuth.access_token,
                installationId: connection.installation_id,
                githubToken: tokenResult.token,
                githubTokenType: tokenResult.tokenType,
                packageManager: project.packageManager,
              },
            );

      return {
        success: syncResult.success,
        message: syncResult.message,
        syncStatus: syncResult.status,
      };
    } catch (error) {
      console.error("[ManualSync] Error:", error);
      return {
        success: false,
        message: "Failed to trigger manual sync",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
