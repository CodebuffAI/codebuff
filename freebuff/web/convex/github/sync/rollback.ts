"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { type BackupInfo } from "../../../codebase-utils/codebase/ExtendedGitOperations";

/**
 * Rollback functionality for the atomic sync engine
 *
 * Provides users with the ability to rollback to backup states
 * when conflicts occur or sync operations fail.
 */

/**
 * Rollback to a backup state (local or GitHub branch)
 */
export const rollbackToBackup = action({
  args: {
    projectId: v.id("project"),
    backupSource: v.union(v.literal("local"), v.literal("github")),
    backupId: v.optional(v.string()), // For local backups
    githubBranch: v.optional(v.string()), // For GitHub branch backups
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    restoredFrom: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      console.log(`[Rollback] Starting rollback for project ${args.projectId}`);

      // Get project details
      const project = await ctx.runQuery(
        internal.github.auth.getProjectDetails,
        {
          projectId: args.projectId,
        },
      );

      if (!project) {
        return {
          success: false,
          message: "Project not found",
          restoredFrom: "",
        };
      }

      let restoredFrom = "";

      if (args.backupSource === "local" && args.backupId) {
        // Restore from local backup using backupService
        console.log(`[Rollback] Restoring from local backup: ${args.backupId}`);
        const backupInfo: BackupInfo = {
          branchName: args.backupId,
          timestamp: "",
          originalBranch: "main",
          hasUncommittedWork: false,
        };
        await ctx.runAction(
          internal.github.sync.services.backupService.restoreFromBackup,
          {
            sandboxId: project.sandbox_id,
            backupInfo,
            packageManager: project.packageManager,
          },
        );
        restoredFrom = `Local backup: ${args.backupId}`;
      } else if (args.backupSource === "github" && args.githubBranch) {
        // Restore from GitHub backup branch
        console.log(
          `[Rollback] Restoring from GitHub branch: ${args.githubBranch}`,
        );

        // Use the backupService's restore functionality with GitHub branch
        const backupInfo: BackupInfo = {
          branchName: args.githubBranch,
          timestamp: "",
          originalBranch: "main",
          hasUncommittedWork: false,
          githubBackupRef: args.githubBranch,
        };

        await ctx.runAction(
          internal.github.sync.services.backupService.restoreFromBackup,
          {
            sandboxId: project.sandbox_id,
            backupInfo,
            packageManager: project.packageManager,
          },
        );

        restoredFrom = `GitHub branch: ${args.githubBranch}`;
      } else {
        return {
          success: false,
          message: "Invalid rollback parameters provided",
          restoredFrom: "",
        };
      }

      // Update sync status to indicate rollback
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "synced",
        lastSyncTime: Date.now(),
        errorMessage: undefined,
      });

      console.log(`[Rollback] Successfully restored from ${restoredFrom}`);

      return {
        success: true,
        message: `Successfully restored project state from ${restoredFrom}`,
        restoredFrom,
      };
    } catch (error: any) {
      console.error("[Rollback] Failed to rollback:", error);
      return {
        success: false,
        message: error.message || "Unknown error during rollback",
        restoredFrom: "",
      };
    }
  },
});

/**
 * List available backups for a project
 */
export const listAvailableBackups = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
    localBackups: v.array(
      v.object({
        id: v.string(),
        description: v.string(),
        timestamp: v.string(),
      }),
    ),
    githubBackups: v.array(
      v.object({
        branch: v.string(),
        description: v.string(),
        timestamp: v.string(),
      }),
    ),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      console.log(`[Rollback] Listing backups for project ${args.projectId}`);

      // Get project details
      const project = await ctx.runQuery(
        internal.github.auth.getProjectDetails,
        {
          projectId: args.projectId,
        },
      );

      if (!project) {
        return {
          success: false,
          localBackups: [],
          githubBackups: [],
          message: "Project not found",
        };
      }

      // For now, let's use a simpler approach to avoid CodeSandbox connection issues
      console.log(`[Rollback] Using simplified backup listing approach`);

      // Get sync state to find GitHub repository info
      const syncState = await ctx.runQuery(
        internal.github.auth.getSyncStateByProject,
        {
          projectId: args.projectId,
        },
      );

      // List local backups (placeholder - would need CodeSandbox access)
      const localBackups: any[] = [];
      console.log(
        "[Rollback] Local backups not accessible without CodeSandbox connection",
      );

      // List GitHub backup branches using GitHub API instead of git commands
      const githubBackups: any[] = [];

      if (syncState) {
        try {
          // Get GitHub connection for API access
          const projectContext: any = await ctx.runAction(
            internal.github.services.projectService.getProjectConnection,
            {
              projectId: args.projectId,
            },
          );

          if (projectContext.success && projectContext.connection) {
            const connection = projectContext.connection;

            {
              // Use GitHub API to list backup branches
              const response = await fetch(
                `https://api.github.com/repos/${syncState.github_repo_owner}/${syncState.github_repo_name}/branches`,
                {
                  headers: {
                    Authorization: `token ${connection.access_token}`,
                    Accept: "application/vnd.github.v3+json",
                  },
                },
              );

              if (response.ok) {
                const branches = await response.json();
                const backupBranches = branches.filter((branch: any) =>
                  branch.name.startsWith("backup-"),
                );

                for (const branch of backupBranches) {
                  githubBackups.push({
                    branch: branch.name,
                    description: branch.name
                      .replace(/backup-|[-]/g, " ")
                      .trim(),
                    timestamp: branch.name.split("-").slice(-2).join("-"),
                  });
                }
              }
            }
          }
        } catch (error) {
          console.log(
            "[Rollback] Could not list GitHub backup branches:",
            error,
          );
        }
      }

      return {
        success: true,
        localBackups,
        githubBackups,
        message: `Found ${localBackups.length} local backups and ${githubBackups.length} GitHub backup branches`,
      };
    } catch (error: any) {
      console.error("[Rollback] Failed to list backups:", error);
      return {
        success: false,
        localBackups: [],
        githubBackups: [],
        message: error.message || "Unknown error listing backups",
      };
    }
  },
});
