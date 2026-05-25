"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { App } from "octokit";
import { GITHUB_APP_CONFIG } from "../config";
import { parsePrivateKey } from "../utils/octokit";

/**
 * Centralized Octokit Service
 * Eliminates duplication of Octokit instance creation across deployment operations
 */

/**
 * Get project GitHub configuration for Octokit creation
 * Returns the necessary data to create Octokit instances locally
 */
export const getProjectGitHubConfig = internalAction({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
    installationId: v.optional(v.number()),
    syncState: v.optional(
      v.object({
        github_repo_owner: v.string(),
        github_repo_name: v.string(),
      }),
    ),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    installationId?: number;
    syncState?: { github_repo_owner: string; github_repo_name: string };
    error?: string;
  }> => {
    try {
      // Get GitHub context using centralized service
      const projectContext: any = await ctx.runAction(
        internal.github.services.projectService.getProjectGitHubContext,
        {
          projectId: args.projectId,
          requireConnection: true,
          requireSyncState: true,
        },
      );

      if (
        !projectContext.success ||
        !projectContext.syncState ||
        !projectContext.connection
      ) {
        return {
          success: false,
          error: projectContext.error || "GitHub context not available",
        };
      }

      const syncState = projectContext.syncState;
      const connection = projectContext.connection;

      if (!connection.installation_id) {
        return {
          success: false,
          error: "GitHub App installation not found",
        };
      }

      return {
        success: true,
        installationId: connection.installation_id,
        syncState: {
          github_repo_owner: syncState.github_repo_owner,
          github_repo_name: syncState.github_repo_name,
        },
      };
    } catch (error) {
      console.error("Failed to get project GitHub config:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Helper function for direct Octokit creation (non-Convex contexts)
 * Provides the same setup pattern for use outside of actions
 */
export async function createOctokitInstance(installationId: number) {
  const privateKey = parsePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY!);
  const app = new App({
    appId: GITHUB_APP_CONFIG.APP_ID,
    privateKey: privateKey,
  });

  return await app.getInstallationOctokit(installationId);
}
