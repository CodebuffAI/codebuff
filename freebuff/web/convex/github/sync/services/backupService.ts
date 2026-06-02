"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { getGitCodebase } from "../../../../codebase-utils/codebase/codebaseHelper";
import type { BackupResult } from "../types";
import { getProjectPackageManager } from "../../../../codebase-utils/packageManager";

/**
 * Backup Service
 *
 * Service for managing backup operations during sync processes.
 * Handles checking for recent backups and creating new backup branches
 * with proper GitHub integration.
 *
 * All operations use the provider-agnostic Codebase interface.
 */

/**
 * Restore from a backup branch
 */
export const restoreFromBackup = internalAction({
  args: {
    sandboxId: v.string(),
    backupInfo: v.object({
      branchName: v.string(),
      timestamp: v.string(),
      commitHash: v.optional(v.string()),
      originalBranch: v.string(),
      hasUncommittedWork: v.boolean(),
      githubBackupRef: v.optional(v.string()),
    }),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    // Initialize codebase
    const codebase = await getGitCodebase(args.sandboxId, args.packageManager);

    await codebase.restoreFromBackup(args.backupInfo);

    // Reinstall dependencies after restore to fix potential node_modules corruption
    console.log(
      "[BackupService] Reinstalling dependencies after backup restore...",
    );
    await codebase.installDependencies();
  },
});

/**
 * Clean up old backup branches (local only, GitHub backups are preserved)
 */
export const cleanupOldBackups = internalAction({
  args: {
    sandboxId: v.string(),
    keepCount: v.optional(v.number()),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    // Initialize codebase
    const codebase = await getGitCodebase(args.sandboxId, args.packageManager);
    await codebase.cleanupOldBackups(args.keepCount);
  },
});

/**
 * Check if we have a recent backup to avoid creating duplicates
 */
export const checkForRecentBackup = internalAction({
  args: {
    sandboxId: v.string(),
    projectDir: v.string(),
    operationType: v.string(),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    try {
      // Initialize codebase
      const codebase = await getGitCodebase(
        args.sandboxId,
        args.packageManager,
      );

      // Look for backup branches created in the last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const timeString = tenMinutesAgo
        .toISOString()
        .slice(0, 16)
        .replace(/[:.]/g, "-");

      // List recent backup branches
      const branches = await codebase.listBranches();
      const remoteBranches = branches.filter(
        (b) => b.startsWith("remotes/") || b.startsWith("origin/"),
      );
      const backupBranches = remoteBranches
        .filter((b) => b.includes(`backup-${args.operationType}`))
        .slice(0, 5);

      if (backupBranches.length > 0) {
        // Check if any branch is recent enough
        for (const branch of backupBranches) {
          const branchName = branch.trim().replace(/^(remotes\/)?origin\//, "");
          if (branchName.includes(timeString.slice(0, 13))) {
            // Match up to hour/minute
            console.log("[BackupService] Found recent backup:", branchName);
            return branchName;
          }
        }
      }

      return null;
    } catch (error) {
      console.log("[BackupService] Could not check for recent backups:", error);
      return null;
    }
  },
});

/**
 * Create backup and push it to GitHub as a branch
 * This creates a safety net that's visible to the user
 */
export const createBackupWithGitHubBranch = internalAction({
  args: {
    sandboxId: v.string(),
    projectDir: v.string(),
    operation: v.object({
      type: v.string(),
      projectId: v.id("project"),
      accessToken: v.string(),
      installationId: v.optional(v.number()),
      repoOwner: v.string(),
      repoName: v.string(),
      options: v.optional(
        v.object({
          createBackup: v.optional(v.boolean()),
          conflictResolution: v.optional(
            v.union(v.literal("manual"), v.literal("block")),
          ),
        }),
      ),
    }),
    divergenceType: v.string(),
  },
  returns: v.object({
    localBackupId: v.string(),
    githubBackupBranch: v.string(),
    canRollback: v.boolean(),
  }),
  handler: async (ctx, args): Promise<BackupResult> => {
    // Get project to retrieve package manager
    const project = await ctx.runQuery(internal.github.auth.getProjectDetails, {
      projectId: args.operation.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const packageManager = await getProjectPackageManager(ctx, project);

    // Initialize codebase
    const codebase = await getGitCodebase(args.sandboxId, packageManager);

    console.log(
      `[BackupService] Creating backup for ${args.divergenceType} operation`,
    );

    // Create local backup using codebase interface
    // This handles uncommitted changes properly and returns to original branch cleanly
    const backupInfo = await codebase.createBackupBranch(
      `${args.operation.type}-sync-${args.divergenceType}`,
    );

    console.log(
      `[BackupService] Local backup branch created: ${backupInfo.branchName}`,
    );

    // Push the backup branch to GitHub for visibility and redundancy
    try {
      // Get token for push operation
      const pushTokenResult = await ctx.runAction(
        internal.github.tokens.service.getGitHubToken,
        {
          operation: {
            type: args.operation.type,
            projectId: args.operation.projectId,
            accessToken: args.operation.accessToken,
            installationId: args.operation.installationId,
          },
          operationName: "backup_push",
        },
      );

      console.log(
        `[BackupService] Pushing backup branch ${backupInfo.branchName} to GitHub`,
      );

      // Push the backup branch that was created by createBackupBranch
      await codebase.push(
        "github",
        backupInfo.branchName,
        false, // Don't force push backup branches
        pushTokenResult.token,
        args.operation.repoOwner,
        args.operation.repoName,
      );

      console.log(
        `[BackupService] Successfully pushed backup branch to GitHub: ${backupInfo.branchName}`,
      );
    } catch (error) {
      console.error(
        "[BackupService] Failed to push backup branch to GitHub:",
        error,
      );
      // Continue - local backup still exists even if GitHub push fails
    }

    return {
      localBackupId: backupInfo.branchName,
      githubBackupBranch: backupInfo.branchName,
      canRollback: true,
    };
  },
});
