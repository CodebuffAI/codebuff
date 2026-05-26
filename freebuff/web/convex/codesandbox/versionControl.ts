"use node";

/**
 * Version Control Module
 *
 * This module provides actions for version control operations.
 * The core logic is encapsulated in the VersioningService class.
 *
 * Architecture:
 * 1. Checkpoints are created as git commits when users send messages
 * 2. Reverts use git revert (not reset) to preserve history
 * 3. Messages are deactivated when reverting to hide future conversation
 * 4. GitHub sync happens asynchronously after commits
 */

import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { v } from "convex/values";
import {
  hasExtendedGitOperations,
  hasPackageManager,
  isVersionControlled,
} from "../../codebase-utils/codebase/Codebase";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import { VersioningService } from "../services/VersioningService";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto as any;
}

export const getCommits = action({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(
      internal.project.getProjectFromIdentifier,
      {
        semanticIdentifier: args.semanticIdentifier,
      },
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );
    console.log("Codebase type:", codebase.constructor.name);
    console.log("Has commit:", "commit" in codebase);
    console.log("Has getCommits:", "getCommits" in codebase);
    console.log("Has revertToCommit:", "revertToCommit" in codebase);
    if (!isVersionControlled(codebase)) {
      throw new Error("Codebase does not support version control");
    }
    return await codebase.getCommits();
  },
});

export const revertToCommit = internalAction({
  args: {
    semanticIdentifier: v.string(),
    commitHash: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    newCommitHash: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const project = await ctx.runQuery(
        internal.project.getProjectFromIdentifier,
        {
          semanticIdentifier: args.semanticIdentifier,
        },
      );

      if (!project) {
        throw new Error("Project not found");
      }

      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      if (!isVersionControlled(codebase)) {
        throw new Error("Codebase does not support version control");
      }
      const newCommitHash = await codebase.revertToCommit(args.commitHash);

      return {
        success: true,
        newCommitHash,
        message: `Successfully reverted to commit ${args.commitHash}. New commit: ${newCommitHash}`,
      };
    } catch (error: any) {
      console.error("Revert to commit failed:", error);
      return {
        success: false,
        message: `Failed to revert to commit: ${error.message || error}`,
      };
    }
  },
});

/**
 * Sync commit to GitHub if sync is enabled for the project
 */
export const syncCommitToGitHub = internalAction({
  args: {
    projectId: v.id("project"),
    commitHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log("Checking if sync is enabled for project:", args.projectId);

      // Get GitHub context for the project (with connection required)
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
        console.log(
          "No sync state or connection found for project, skipping GitHub sync",
        );
        return null;
      }

      const syncState = projectContext.syncState;
      const connection = projectContext.connection;

      // CRITICAL: Check for conflict status before pushing commits
      if (syncState.sync_status === "conflict") {
        console.log(
          "BLOCKING automatic commit sync due to GitHub conflicts:",
          args.projectId,
        );
        console.log(
          "Manual conflict resolution required before syncing commits to GitHub",
        );
        return null;
      }

      console.log(
        "Sync enabled, pushing commit to GitHub via executor service",
      );

      // Get project to retrieve sandbox_id
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        console.log("Project not found, skipping GitHub sync");
        return null;
      }

      // Fetch GitHub token once for this sync flow
      console.log(
        `[VersionControl] Fetching GitHub token for project ${args.projectId}`,
      );
      const tokenResult = await ctx.runAction(
        internal.github.tokens.service.getGitHubToken,
        {
          operation: {
            type: "project_to_github",
            projectId: args.projectId,
            accessToken: connection.access_token,
            installationId: connection.installation_id,
          },
          operationName: "commit_sync",
        },
      );

      // Call executor service directly (it handles preflight, backups, and status updates)
      const syncResult = await ctx.runAction(
        internal.github.sync.services.syncExecutorService
          .executeProjectToGitHubSync,
        {
          sandboxId: project.sandbox_id,
          projectId: args.projectId,
          repoOwner: syncState.github_repo_owner,
          repoName: syncState.github_repo_name,
          accessToken: connection.access_token,
          installationId: connection.installation_id,
          githubToken: tokenResult.token,
          githubTokenType: tokenResult.tokenType,
          packageManager: project.packageManager,
        },
      );

      if (syncResult.success) {
        console.log(
          "Commit synced to GitHub successfully via executor service",
        );
      } else {
        console.log(
          "Sync completed with status:",
          syncResult.status,
          "-",
          syncResult.message,
        );
      }
    } catch (error) {
      console.error("Failed to sync commit to GitHub:", error);
      // Don't throw error as this shouldn't break the commit process
    }

    return null;
  },
});

export const commit = internalAction({
  args: {
    projectId: v.id("project"),
    message: v.string(),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );
    if (!isVersionControlled(codebase)) {
      throw new Error("Codebase does not support version control");
    }

    if (hasExtendedGitOperations(codebase)) {
      const status = await codebase.getStatus();
      const totalChanges =
        status.staged.length + status.unstaged.length + status.untracked.length;

      if (totalChanges === 0) {
        console.log(
          "[VersionControl] Working tree is clean, skipping empty checkpoint commit",
        );
        return {
          hash: "no-changes",
          message: args.message,
          author: "vly.ai",
          timestamp: Date.now(),
        };
      }
    }

    const commit = await codebase.commit(args.message, false);

    // Schedule convex dev command to run asynchronously
    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.versionControl.runConvexDev,
      {
        sandboxId: project.sandbox_id,
        packageManager: project.packageManager,
      },
    );

    if (args.messageId) {
      await ctx.runMutation(internal.messages.updateCommitHash, {
        messageId: args.messageId,
        commitHash: commit.hash,
      });
    }

    // Increment screenshot counter (triggers screenshot after 10 commits)
    await ctx.runMutation(internal.screenshot.incrementCommitCounter, {
      projectId: args.projectId,
    });

    // Schedule GitHub sync to run asynchronously (non-blocking)
    if (commit.hash && commit.hash !== "no-changes") {
      await ctx.scheduler.runAfter(
        0,
        internal.codesandbox.versionControl.syncCommitToGitHub,
        {
          projectId: args.projectId,
          commitHash: commit.hash,
        },
      );
    }

    return commit;
  },
});

export const revert = action({
  args: {
    semanticIdentifier: v.string(),
    commitHash: v.string(),
    source: v.optional(v.union(v.literal("chat"), v.literal("versions_page"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Authentication required. Please log in and try again.");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error(
        "Project not found. It may have been deleted or you may not have access.",
      );
    }

    // Use the VersioningService to handle the revert
    const versioningService = new VersioningService(ctx);
    await versioningService.revertToCheckpoint(
      project._id,
      args.semanticIdentifier,
      args.commitHash,
      args.source,
    );
  },
});

export const runConvexDev = internalAction({
  args: {
    sandboxId: v.string(),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
  },
  handler: async (ctx, args) => {
    try {
      const codebase = await initializeCodebase(
        args.sandboxId,
        args.packageManager,
      );
      if (!hasPackageManager(codebase)) {
        throw new Error("Codebase does not support package manager");
      }
      const pm = codebase.getPackageManager();
      await codebase.runCommand(pm.run("convex dev --once"));
    } catch (e) {
      // ignore errors - this is a best-effort operation
      console.log("Failed to run convex dev --once:", e);
    }
  },
});
