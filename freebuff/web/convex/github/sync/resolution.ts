"use node";

import { action, internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";

/**
 * Conflict Resolution for GitHub Sync
 *
 * Handles resolution of diverged repositories and merge conflicts.
 * Provides both specific and unified resolution approaches.
 *
 * Consolidated from resolution.ts and unified_resolution.ts
 */

/**
 * Internal action for resolving divergence
 */
export const resolveDivergenceInternal = internalAction({
  args: {
    projectId: v.id("project"),
    strategy: v.union(
      v.literal("use_github_version"),
      v.literal("use_local_version"),
      v.literal("use_backup_version"),
    ),
    backupBranch: v.optional(v.string()), // Required for use_backup_version
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    newStatus: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    newStatus: string;
  }> => {
    try {
      console.log(
        `[ResolveDivergence] Resolving divergence for project ${args.projectId} using strategy: ${args.strategy}`,
      );

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
          newStatus: "error",
        };
      }

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
          message: projectContext.error || "GitHub context not available",
          newStatus: "error",
        };
      }

      const syncState = projectContext.syncState;
      const connection = projectContext.connection;

      // Handle backup restoration separately (not yet implemented)
      if (args.strategy === "use_backup_version") {
        return {
          success: false,
          message: "Backup restoration not yet implemented",
          newStatus: "error",
        };
      }

      // Update sync status to pending during resolution
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "pending",
        lastSyncTime: Date.now(),
        errorMessage: `Resolving with strategy: ${args.strategy}`,
      });

      // Fetch GitHub token once for this resolution flow
      console.log(
        `[ResolveDivergence] Fetching GitHub token for project ${args.projectId}`,
      );
      const tokenResult = await ctx.runAction(
        internal.github.tokens.service.getGitHubToken,
        {
          operation: {
            type:
              args.strategy === "use_github_version"
                ? "github_to_project"
                : "project_to_github",
            projectId: args.projectId,
            accessToken: connection.access_token,
            installationId: connection.installation_id,
          },
          operationName: "resolution",
        },
      );

      // Execute the resolution using the simple resolution executor service
      const result = await ctx.runAction(
        internal.github.sync.services.resolutionExecutorService
          .executeResolution,
        {
          projectId: args.projectId,
          strategy: args.strategy,
          repoOwner: syncState.github_repo_owner,
          repoName: syncState.github_repo_name,
          sandboxId: project.sandbox_id,
          githubToken: tokenResult.token,
          githubTokenType: tokenResult.tokenType,
          installationId: connection.installation_id,
        },
      );

      // Update sync status based on result
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: result.success ? "synced" : "error",
        lastSyncTime: Date.now(),
        errorMessage: result.success ? undefined : result.message,
      });

      if (result.success) {
        await ctx.runMutation(internal.project.setStateDone, {
          projectId: args.projectId,
        });

        return {
          success: true,
          message: result.message,
          newStatus: "synced",
        };
      } else {
        return {
          success: false,
          message: result.message || "Failed to resolve divergence",
          newStatus: "error",
        };
      }
    } catch (error) {
      console.error("Error in resolveDivergence:", error);

      // Update sync status on error
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "error",
        lastSyncTime: Date.now(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        newStatus: "error",
      };
    }
  },
});

/**
 * Public wrapper for resolving divergence
 */
export const resolveDivergence = action({
  args: {
    projectId: v.id("project"),
    strategy: v.union(
      v.literal("use_github_version"),
      v.literal("use_local_version"),
      v.literal("use_backup_version"),
    ),
    backupBranch: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    newStatus: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    newStatus: string;
  }> => {
    return await ctx.runAction(
      internal.github.sync.resolution.resolveDivergenceInternal,
      args,
    );
  },
});

/**
 * Get conflict information for a project
 */
export const getConflictInfo = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    hasConflicts: v.boolean(),
    conflictType: v.optional(v.string()),
    conflictDetails: v.optional(v.any()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    hasConflicts: boolean;
    conflictType?: string;
    conflictDetails?: any;
  }> => {
    try {
      // Get sync state to check for conflicts
      const syncState: any = await ctx.runQuery(
        internal.github.auth.getSyncStateByProject,
        {
          projectId: args.projectId,
        },
      );

      if (!syncState) {
        return {
          hasConflicts: false,
        };
      }

      const hasConflicts: boolean = syncState.sync_status === "conflict";

      return {
        hasConflicts,
        conflictType: hasConflicts ? "divergence" : undefined,
        conflictDetails: hasConflicts
          ? {
              divergence: {
                isDivergent: true,
                ahead: 0,
                behind: 0,
                status: "diverged",
                canFastForward: false,
              },
            }
          : undefined,
      };
    } catch (error) {
      console.error("Error getting conflict info:", error);
      return {
        hasConflicts: false,
      };
    }
  },
});

/**
 * Get available resolution options for a project
 */
export const getResolutionOptions = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    canUseGitHub: v.boolean(),
    canUseLocal: v.boolean(),
    canUseBackup: v.boolean(),
    availableBackups: v.array(v.string()),
    recommendedStrategy: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      // For now, return default values since backup functionality might not be fully implemented
      const backups = {
        backups: [],
      };

      return {
        canUseGitHub: true, // Always available
        canUseLocal: true, // Always available
        canUseBackup: backups.backups.length > 0,
        availableBackups: backups.backups.map((b: any) => b.branchName),
        recommendedStrategy: "use_local_version", // Default recommendation
      };
    } catch (error) {
      console.error("Error getting resolution options:", error);
      return {
        canUseGitHub: true,
        canUseLocal: true,
        canUseBackup: false,
        availableBackups: [],
        recommendedStrategy: "use_local_version",
      };
    }
  },
});

/**
 * Unified conflict resolution that detects conflict type and routes to appropriate handler
 */
export const resolveConflicts = action({
  args: {
    projectId: v.id("project"),
    resolutionType: v.union(
      v.literal("divergence"), // Repository divergence
      v.literal("auto_detect"), // Auto-detect based on conflict data
    ),
    // For divergence conflicts
    divergenceStrategy: v.optional(
      v.union(
        v.literal("use_github_version"),
        v.literal("use_local_version"),
        v.literal("use_backup_version"),
      ),
    ),
    backupBranch: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    resolvedType: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string; resolvedType: string }> => {
    try {
      console.log(
        `[UnifiedResolution] Resolving conflicts for project ${args.projectId}`,
      );
      console.log(`[UnifiedResolution] Args:`, args);

      // Get GitHub context using centralized service
      console.log(`[UnifiedResolution] Getting GitHub context...`);
      const projectContext: any = await ctx.runAction(
        internal.github.services.projectService.getProjectGitHubContext,
        {
          projectId: args.projectId,
          requireConnection: false,
          requireSyncState: true,
        },
      );
      const syncState = projectContext.success
        ? projectContext.syncState
        : null;
      console.log(`[UnifiedResolution] Sync state:`, syncState);

      if (
        !syncState ||
        (syncState.sync_status !== "conflict" &&
          syncState.sync_status !== "error")
      ) {
        return {
          success: false,
          message: "No conflicts found for this project",
          resolvedType: "none",
        };
      }

      // Check if this is a repository divergence error (CodeSandbox constructor issue indicates divergence)
      const isCodeSandboxError = syncState.error_message?.includes(
        "browser_default is not a constructor",
      );
      const hasRepositoryDivergence =
        syncState.sync_status === "error" && isCodeSandboxError;

      // If we detect a CodeSandbox constructor error, update the status to "conflict" so the UI can handle it
      if (hasRepositoryDivergence) {
        console.log(
          `[UnifiedResolution] Converting error status to conflict for CodeSandbox constructor issue`,
        );
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: "conflict",
          lastSyncTime: Date.now(),
          errorMessage:
            "Repository divergence detected - manual resolution required",
        });
      }

      // Auto-detect conflict type based on sync state
      let detectedType = "unknown";
      if (
        hasRepositoryDivergence ||
        syncState.sync_status === "conflict" ||
        args.resolutionType === "divergence"
      ) {
        detectedType = "divergence";
      }

      console.log(
        `[UnifiedResolution] Detected conflict type: ${detectedType}`,
      );

      // Handle divergence conflicts
      if (detectedType === "divergence") {
        const strategy = args.divergenceStrategy || "use_local_version";
        console.log(
          `[UnifiedResolution] Resolving divergence with strategy: ${strategy}`,
        );

        // Delegate to the dedicated resolveDivergence internal action
        const divergenceResult = await ctx.runAction(
          internal.github.sync.resolution.resolveDivergenceInternal,
          {
            projectId: args.projectId,
            strategy: strategy,
            backupBranch: args.backupBranch,
          },
        );

        console.log(
          `[UnifiedResolution] Divergence resolution result:`,
          divergenceResult,
        );

        return {
          success: divergenceResult.success,
          message: divergenceResult.message,
          resolvedType: "divergence",
        };
      }

      // For other conflict types, return unhandled for now
      return {
        success: false,
        message: `Conflict type '${detectedType}' not yet supported by unified resolution`,
        resolvedType: detectedType,
      };
    } catch (error) {
      console.error("[UnifiedResolution] Error resolving conflicts:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        resolvedType: "error",
      };
    }
  },
});
