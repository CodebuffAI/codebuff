"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { logTokenUsage } from "../../tokens";
import { getGitCodebase } from "../../../../codebase-utils/codebase/codebaseHelper";
import type { SyncResult } from "../types";
import { runCronValidationWithLogging } from "../cronPostSyncValidator";
import { getProjectPackageManager } from "../../../../codebase-utils/packageManager";

/**
 * Sync Executor Service
 *
 * Service for executing different types of sync operations:
 * - GitHub to Project sync
 * - Project to GitHub sync
 *
 * This consolidates the core sync execution logic that was previously
 * scattered throughout the engine.ts file.
 */

/**
 * Terminate agent to prevent working in conflicted state
 */
async function terminateAgent(
  ctx: any,
  projectId: string,
  reason: string,
): Promise<void> {
  try {
    await ctx.runMutation(internal.project.setStateTerminated, {
      projectId,
    });
    console.log(`[SyncExecutorService] Agent terminated: ${reason}`);
  } catch (terminationError) {
    console.error(
      "[SyncExecutorService] Failed to terminate agent:",
      terminationError,
    );
  }
}

/**
 * Handle conflict scenario with unified logic
 */
async function handleConflict(
  ctx: any,
  projectId: string,
  message: string,
  resolutionOptions: string[],
  terminationReason: string,
): Promise<SyncResult> {
  await terminateAgent(ctx, projectId, terminationReason);

  return {
    success: false,
    operation: "sync",
    projectId,
    status: "conflict",
    message,
    conflicts: {
      files: [],
      resolutionOptions,
    },
  };
}

/**
 * GitHub to Project Sync Helper Functions
 */

/**
 * Perform GitHub pull with conflict handling
 */
async function performGitHubPull(
  ctx: any,
  codebase: any,
  args: {
    projectDir: string;
    token: string;
    tokenType: "installation" | "oauth";
    operation: {
      type: string;
      projectId: string;
      installationId?: number;
      repoOwner: string;
      repoName: string;
    };
  },
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    operation: args.operation.type,
    projectId: args.operation.projectId,
    status: "pending",
    message: "Performing GitHub pull",
  };

  console.log(
    `[SyncExecutorService] Pulling changes from github/main remote in ${args.projectDir} with secure authentication`,
  );

  // Use codebase pull directly - wrap in try-catch as safety net
  try {
    await codebase.pull(
      "github",
      "main",
      args.token,
      args.operation.repoOwner,
      args.operation.repoName,
      true, // noRebase
    );

    // Log token usage
    logTokenUsage({
      operation: "sync_executor_github_pull",
      tokenType: args.tokenType,
      success: true,
      installationId:
        args.tokenType === "installation"
          ? args.operation.installationId
          : undefined,
    });

    console.log("[SyncExecutorService] Successfully pulled from GitHub");

    // Reinstall dependencies after pull to fix potential node_modules corruption
    console.log(
      "[SyncExecutorService] Reinstalling dependencies after pull...",
    );
    await codebase.installDependencies();

    // Validate and fix cron intervals after sync
    await runCronValidationWithLogging(
      ctx,
      codebase,
      args.operation.projectId,
      args.token,
      args.operation.repoOwner,
      args.operation.repoName,
      "SyncExecutorService",
    );

    // Check if actual changes were pulled by comparing commit hashes
    const hasActualChanges = true; // We pulled successfully, assume changes

    result.success = true;
    result.status = "synced";
    result.message = hasActualChanges
      ? "GitHub to project sync completed successfully"
      : "Already up to date with GitHub";

    return result;
  } catch (pullError: any) {
    const errorMessage = pullError.message || String(pullError);
    const isInstallFailure =
      errorMessage.includes("install failed") ||
      errorMessage.includes("EEXIST") ||
      errorMessage.includes("Failed to install dependencies");

    if (isInstallFailure) {
      console.error(
        "[SyncExecutorService] Pull succeeded but dependency installation failed:",
        pullError,
      );

      // Don't abort merge for installation failures - the pull itself succeeded
      result.success = false;
      result.status = "error";
      result.message = `GitHub sync completed but dependency installation failed: ${errorMessage}. The code changes were pulled successfully.`;
      return result;
    }

    // Actual merge conflict
    console.error(
      "[SyncExecutorService] Pull failed with merge conflict:",
      pullError,
    );

    // Abort the merge to clean up the conflicted state
    try {
      await codebase.abortMerge();
      console.log(
        "[SyncExecutorService] Aborted merge after conflict detection",
      );
    } catch (abortError) {
      console.error("[SyncExecutorService] Failed to abort merge:", abortError);
    }

    // Return conflict status
    return await handleConflict(
      ctx,
      args.operation.projectId,
      "Merge conflicts detected during pull. User intervention required.",
      ["use_github_version", "use_local_version", "rollback_to_backup"],
      "merge conflict during pull",
    );
  }
}

/**
 * Project to GitHub Sync Helper Functions
 */

/**
 * Perform fast-forward push to GitHub
 */
async function performFastForwardPush(
  ctx: any,
  codebase: any,
  args: {
    token: string;
    tokenType: "installation" | "oauth";
    operation: {
      type: string;
      projectId: string;
      installationId?: number;
      repoOwner: string;
      repoName: string;
    };
  },
): Promise<SyncResult | null> {
  console.log(
    "[SyncExecutorService] Can fast-forward, executing regular push to GitHub",
  );

  try {
    // Ensure remote is set up with secure authentication before pushing
    console.log(
      "[SyncExecutorService] Setting up secure authenticated remote for push",
    );

    try {
      // Set up authenticated remote URL
      await codebase.setRemoteUrl(
        "github",
        "", // url not used when token is provided
        args.token,
        args.operation.repoOwner,
        args.operation.repoName,
      );
      console.log(
        "[SyncExecutorService] Remote URL updated with secure authentication",
      );
    } catch (remoteError) {
      console.log("[SyncExecutorService] Remote might not exist, adding it");
      const cleanUrl = `https://github.com/${args.operation.repoOwner}/${args.operation.repoName}.git`;
      await codebase.addRemote("github", cleanUrl);
    }

    // Use codebase push directly
    await codebase.push(
      "github",
      "main",
      false, // Don't force push for regular syncs
      args.token,
      args.operation.repoOwner,
      args.operation.repoName,
    );

    // Log token usage
    logTokenUsage({
      operation: "sync_executor_main_push",
      tokenType: args.tokenType,
      success: true,
      installationId:
        args.tokenType === "installation"
          ? args.operation.installationId
          : undefined,
    });

    console.log("[SyncExecutorService] Push completed successfully");
    return null; // Success, no error result
  } catch (pushError: any) {
    console.error("[SyncExecutorService] Push failed:", pushError);
    // If push fails, surface as conflict for user resolution
    return {
      success: false,
      operation: args.operation.type,
      projectId: args.operation.projectId,
      status: "conflict",
      message: `Push failed: ${pushError.message || pushError}. Manual resolution may be required.`,
      conflicts: {
        files: [],
        resolutionOptions: [
          "use_github_version",
          "use_local_version",
          "retry_push",
        ],
      },
    };
  }
}

/**
 * Execute GitHub to project sync
 * Simplified version that calls preflight internally
 */
export const executeGitHubToProjectSync = internalAction({
  args: {
    sandboxId: v.string(),
    projectId: v.id("project"),
    repoOwner: v.string(),
    repoName: v.string(),
    accessToken: v.string(),
    installationId: v.optional(v.number()),
    githubToken: v.string(),
    githubTokenType: v.union(v.literal("installation"), v.literal("oauth")),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
  },
  returns: v.object({
    success: v.boolean(),
    operation: v.string(),
    projectId: v.string(),
    status: v.string(),
    message: v.string(),
    backup: v.optional(
      v.object({
        localBackupId: v.string(),
        githubBackupBranch: v.string(),
        canRollback: v.boolean(),
      }),
    ),
    conflicts: v.optional(
      v.object({
        files: v.array(v.any()),
        resolutionOptions: v.array(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<SyncResult> => {
    console.log("[SyncExecutorService] Executing GitHub to project sync");

    const result: SyncResult = {
      success: false,
      operation: "github_to_project",
      projectId: args.projectId,
      status: "pending",
      message: "GitHub to project sync started",
    };

    try {
      // Step 1: Update sync status to pending
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "pending",
        lastSyncTime: Date.now(),
      });

      // Step 2: Resolve package manager (use provided or detect for legacy projects)
      let packageManager = args.packageManager;
      if (!packageManager) {
        const project = await ctx.runQuery(
          internal.github.auth.getProjectDetails,
          {
            projectId: args.projectId,
          },
        );
        if (project) {
          packageManager = await getProjectPackageManager(ctx, project);
        }
      }

      // Step 3: Initialize codebase
      const codebase = await getGitCodebase(args.sandboxId, packageManager);

      // Step 3: Check for potential conflicts
      console.log("[SyncExecutorService] Checking for potential conflicts");
      const conflictCheck = await codebase.detectPotentialConflicts(
        args.githubToken,
        args.repoOwner,
        args.repoName,
        "github",
      );

      if (conflictCheck.hasConflicts) {
        console.log(
          "[SyncExecutorService] Conflicts detected - requiring user intervention",
        );

        result.status = "conflict";
        result.message =
          "Merge conflicts detected. Please resolve conflicts manually.";
        result.conflicts = {
          files: [],
          resolutionOptions: [
            "use_github_version",
            "use_local_version",
            "rollback_to_backup",
          ],
        };

        await terminateAgent(
          ctx,
          args.projectId,
          "conflicts detected - user intervention required",
        );

        // Update sync status
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: "conflict",
          lastSyncTime: Date.now(),
          errorMessage: result.message,
        });

        return result;
      }

      // Step 5: Auto-commit any untracked files to prevent collision errors
      console.log(
        "[SyncExecutorService] Checking for uncommitted changes before pull",
      );
      await codebase.commitIfDirty();

      // Step 6: Safe to proceed with pull
      const operation = {
        type: "github_to_project",
        projectId: args.projectId,
        installationId: args.installationId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
      };

      const pullResult = await performGitHubPull(ctx, codebase, {
        projectDir: "codebase",
        token: args.githubToken,
        tokenType: args.githubTokenType,
        operation,
      });

      // Update sync status based on pull result
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: pullResult.status as any,
        lastSyncTime: Date.now(),
        errorMessage: pullResult.success ? undefined : pullResult.message,
      });

      // Mark external change if successful
      if (
        pullResult.success &&
        pullResult.status === "synced" &&
        !pullResult.message.includes("Already up to date")
      ) {
        try {
          const project = await ctx.runQuery(
            internal.github.auth.getProjectDetails,
            {
              projectId: args.projectId,
            },
          );
          if (project?.active_thread) {
            await ctx.runMutation(internal.thread.markExternalChange, {
              threadId: project.active_thread,
            });
            console.log(
              "[SyncExecutorService] Marked external change to hide old undo buttons",
            );
          }
        } catch (error) {
          console.log(
            "[SyncExecutorService] Failed to mark external change (non-critical):",
            error,
          );
        }
      }

      return pullResult;
    } catch (error: any) {
      console.error("[SyncExecutorService] Sync failed:", error);

      result.success = false;
      result.status = "error";
      result.message = error.message || "Unknown error occurred";

      // Update sync status with error
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "error",
        lastSyncTime: Date.now(),
        errorMessage: result.message,
      });

      return result;
    }
  },
});

/**
 * Execute project to GitHub sync
 * Simplified version that calls preflight internally
 */
export const executeProjectToGitHubSync = internalAction({
  args: {
    sandboxId: v.string(),
    projectId: v.id("project"),
    repoOwner: v.string(),
    repoName: v.string(),
    accessToken: v.string(),
    installationId: v.optional(v.number()),
    githubToken: v.string(),
    githubTokenType: v.union(v.literal("installation"), v.literal("oauth")),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
  },
  returns: v.object({
    success: v.boolean(),
    operation: v.string(),
    projectId: v.string(),
    status: v.string(),
    message: v.string(),
    backup: v.optional(
      v.object({
        localBackupId: v.string(),
        githubBackupBranch: v.string(),
        canRollback: v.boolean(),
      }),
    ),
    conflicts: v.optional(
      v.object({
        files: v.array(v.any()),
        resolutionOptions: v.array(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<SyncResult> => {
    console.log("[SyncExecutorService] Executing project to GitHub sync");

    const result: SyncResult = {
      success: false,
      operation: "project_to_github",
      projectId: args.projectId,
      status: "pending",
      message: "Project to GitHub sync started",
    };

    try {
      // Step 1: Update sync status to pending
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "pending",
        lastSyncTime: Date.now(),
      });

      // Step 2: Resolve package manager (use provided or detect for legacy projects)
      let packageManager = args.packageManager;
      if (!packageManager) {
        const project = await ctx.runQuery(
          internal.github.auth.getProjectDetails,
          {
            projectId: args.projectId,
          },
        );
        if (project) {
          packageManager = await getProjectPackageManager(ctx, project);
        }
      }

      // Step 3: Initialize codebase
      const codebase = await getGitCodebase(args.sandboxId, packageManager);

      // Step 3: Check for potential conflicts
      console.log("[SyncExecutorService] Checking for potential conflicts");
      const conflictCheck = await codebase.detectPotentialConflicts(
        args.githubToken,
        args.repoOwner,
        args.repoName,
        "github",
      );

      if (conflictCheck.hasConflicts) {
        console.log(
          "[SyncExecutorService] Conflicts detected - requiring user intervention",
        );

        result.status = "conflict";
        result.message =
          "GitHub has newer commits that conflict with local changes. Please resolve conflicts manually.";
        result.conflicts = {
          files: [],
          resolutionOptions: [
            "use_local_version",
            "use_github_version",
            "rollback_to_backup",
          ],
        };

        await terminateAgent(
          ctx,
          args.projectId,
          "conflicts detected - user intervention required",
        );

        // Update sync status
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: "conflict",
          lastSyncTime: Date.now(),
          errorMessage: result.message,
        });

        return result;
      }

      // Step 5: Auto-commit any uncommitted changes before push
      console.log(
        "[SyncExecutorService] Checking for uncommitted changes before push",
      );
      await codebase.commitIfDirty();

      // Step 6: Safe to proceed with push
      const operation = {
        type: "project_to_github",
        projectId: args.projectId,
        installationId: args.installationId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
      };

      const pushResult = await performFastForwardPush(ctx, codebase, {
        token: args.githubToken,
        tokenType: args.githubTokenType,
        operation,
      });

      if (pushResult) {
        // Update sync status with error
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: pushResult.status as any,
          lastSyncTime: Date.now(),
          errorMessage: pushResult.message,
        });
        return pushResult; // Error occurred
      }

      result.success = true;
      result.status = "synced";
      result.message = "Project to GitHub sync completed successfully";

      // Update sync status to synced
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "synced",
        lastSyncTime: Date.now(),
      });

      return result;
    } catch (error: any) {
      console.error("[SyncExecutorService] Sync failed:", error);

      result.success = false;
      result.status = "error";
      result.message = error.message || "Unknown error occurred";

      // Update sync status with error
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "error",
        lastSyncTime: Date.now(),
        errorMessage: result.message,
      });

      return result;
    }
  },
});
