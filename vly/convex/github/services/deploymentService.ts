"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { initializeCodebase } from "../../../codebase-utils/codebase/initializeCodebase";
import {
  isVersionControlled,
  hasExtendedGitOperations,
} from "../../../codebase-utils/codebase/Codebase";

/**
 * Deployment Service
 *
 * Service for production deployment preparation and version management.
 * Handles committing changes, creating version tags, and pushing to GitHub.
 *
 * All operations use the provider-agnostic Codebase interface for
 * efficient single-initialization workflows.
 */

export interface DeploymentResult {
  success: boolean;
  committed: boolean;
  tagged: boolean;
  commitHash?: string;
  tagName?: string;
  error?: string;
}

/**
 * Generate a semantic version number based on deployment
 * This function creates a version number in the format: YYYY.MM.DD.HHMM
 */
export function generateDeploymentVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${year}.${month}.${day}.${hour}${minute}`;
}

/**
 * Prepare for production deployment by committing changes, creating tags, and pushing
 */
export const prepareProductionDeployment = internalAction({
  args: {
    projectId: v.id("project"),
    sandboxId: v.string(),
    deploymentMessage: v.optional(v.string()),
    repoOwner: v.string(),
    repoName: v.string(),
    accessToken: v.string(),
    installationId: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    committed: v.boolean(),
    tagged: v.boolean(),
    commitHash: v.optional(v.string()),
    tagName: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<DeploymentResult> => {
    console.log(`[DeploymentService] Preparing for production deployment`);

    try {
      // Initialize codebase once for all operations
      const codebase = await initializeCodebase(args.sandboxId);

      if (
        !isVersionControlled(codebase) ||
        !hasExtendedGitOperations(codebase)
      ) {
        return {
          success: false,
          committed: false,
          tagged: false,
          error: "Codebase does not support git operations",
        };
      }

      const message =
        args.deploymentMessage || "Production deployment preparation";

      // Step 1: Commit all uncommitted changes
      console.log("[DeploymentService] Checking for uncommitted changes");
      const status = await codebase.getStatus();
      const hasChanges =
        status.staged.length > 0 ||
        status.unstaged.length > 0 ||
        status.untracked.length > 0;

      let committed = false;
      let commitHash: string | undefined;

      if (hasChanges) {
        console.log("[DeploymentService] Committing changes");
        await codebase.addAll();
        const commit = await codebase.commit(message);
        commitHash = commit.hash;
        committed = true;
        console.log(`[DeploymentService] Changes committed: ${commitHash}`);
      } else {
        // Get current commit hash even if no new commit
        commitHash = await codebase.getCommitHash("HEAD");
        console.log("[DeploymentService] No uncommitted changes");
      }

      // Step 2: Generate version and create tag
      console.log("[DeploymentService] Creating version tag");
      const version = generateDeploymentVersion();
      const tagName = `v${version}`;
      const tagMessage = `Production deployment ${version}`;

      await codebase.createTag(tagName, tagMessage);
      console.log(`[DeploymentService] Tag created: ${tagName}`);

      // Step 3: Push all changes to remote using codebase interface
      console.log("[DeploymentService] Pushing changes to GitHub");

      // Get token for push operation
      const pushTokenResult = await ctx.runAction(
        internal.github.tokens.service.getGitHubToken,
        {
          operation: {
            type: "deployment",
            projectId: args.projectId,
            accessToken: args.accessToken,
            installationId: args.installationId,
          },
          operationName: "deployment_push",
        },
      );

      // Get current branch and push directly using codebase interface
      const branch = await codebase.getCurrentBranch();

      try {
        await codebase.push(
          "github",
          branch,
          false, // Don't force push
          pushTokenResult.token,
          args.repoOwner,
          args.repoName,
        );
        console.log("[DeploymentService] Changes pushed successfully");
      } catch (pushError: any) {
        return {
          success: false,
          committed,
          tagged: true,
          commitHash,
          tagName,
          error: `Failed to push changes: ${pushError.message || pushError}`,
        };
      }

      // Step 4: Push the tag with authentication
      console.log("[DeploymentService] Pushing tag to GitHub");
      await codebase.pushTag(
        "github",
        tagName,
        pushTokenResult.token,
        args.repoOwner,
        args.repoName,
      );
      console.log("[DeploymentService] Tag pushed successfully");

      console.log(
        "[DeploymentService] Production deployment preparation completed",
      );
      return {
        success: true,
        committed,
        tagged: true,
        commitHash,
        tagName,
      };
    } catch (error: any) {
      console.error(
        "[DeploymentService] Error preparing for production deployment:",
        error,
      );
      return {
        success: false,
        committed: false,
        tagged: false,
        error:
          error.message || "Unknown error preparing for production deployment",
      };
    }
  },
});

/**
 * Check if working directory is clean (no uncommitted changes)
 */
export const checkWorkingDirectoryStatus = internalAction({
  args: {
    sandboxId: v.string(),
  },
  returns: v.object({
    isClean: v.boolean(),
    fileCount: v.number(),
    files: v.array(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const codebase = await initializeCodebase(args.sandboxId);

      if (
        !isVersionControlled(codebase) ||
        !hasExtendedGitOperations(codebase)
      ) {
        return {
          isClean: false,
          fileCount: 0,
          files: [],
          error: "Codebase does not support git operations",
        };
      }

      const status = await codebase.getStatus();
      const files = [...status.staged, ...status.unstaged, ...status.untracked];
      const isClean = files.length === 0;

      return {
        isClean,
        fileCount: files.length,
        files,
      };
    } catch (error: any) {
      console.error(
        "[DeploymentService] Error checking working directory status:",
        error,
      );
      return {
        isClean: false,
        fileCount: 0,
        files: [],
        error: error.message || "Unknown error checking working directory",
      };
    }
  },
});

/**
 * Emergency rollback to restore development environment to clean state
 * Removes all merge markers and uncommitted changes
 */
export const rollbackToCleanState = internalAction({
  args: {
    sandboxId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      console.log("[DeploymentService] Rolling back to clean state");

      const codebase = await initializeCodebase(args.sandboxId);

      if (
        !isVersionControlled(codebase) ||
        !hasExtendedGitOperations(codebase)
      ) {
        return {
          success: false,
          error: "Codebase does not support git operations",
        };
      }

      // Abort any ongoing merge
      try {
        await codebase.runCommand("git merge --abort", 10000);
        console.log("[DeploymentService] Aborted ongoing merge");
      } catch {
        console.log("[DeploymentService] No ongoing merge to abort");
      }

      // Reset to last commit (removes all uncommitted changes)
      await codebase.resetHard("HEAD");
      console.log("[DeploymentService] Reset to last commit");

      // Clean working directory (removes untracked files)
      await codebase.runCommand("git clean -fd", 15000);
      console.log("[DeploymentService] Cleaned working directory");

      // Verify clean state
      const status = await codebase.getStatus();
      const files = [...status.staged, ...status.unstaged, ...status.untracked];

      if (files.length === 0) {
        console.log(
          "[DeploymentService] Successfully rolled back to clean state",
        );
        return { success: true };
      } else {
        console.warn(
          "[DeploymentService] Warning: Some files still show as modified after rollback",
        );
        return {
          success: false,
          error: `${files.length} files still modified after rollback`,
        };
      }
    } catch (error: any) {
      console.error(
        "[DeploymentService] Failed to rollback to clean state:",
        error,
      );
      return {
        success: false,
        error: error.message || "Rollback failed",
      };
    }
  },
});
