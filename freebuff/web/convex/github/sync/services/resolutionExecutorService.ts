"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import {
  getGitCodebase,
  type GitCodebase,
} from "../../../../codebase-utils/codebase/codebaseHelper";
import { hasDevServer } from "../../../../codebase-utils/codebase/Codebase";
import { logTokenUsage } from "../../tokens";
import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { internal } from "../../../_generated/api";
import { getProjectPackageManager } from "../../../../codebase-utils/packageManager";

/**
 * Resolution Executor Service
 *
 * Simple, direct resolution of diverged repository states.
 * When user explicitly chooses a resolution strategy, execute it directly
 * without complex preflight checks or conditional logic.
 *
 * Always creates backup branches for safety.
 */

type ResolutionContext = {
  ctx: ActionCtx;
  codebase: GitCodebase;
  projectId: Id<"project">;
  repoOwner: string;
  repoName: string;
  installationId: number | undefined;
  githubToken: string;
  githubTokenType: "installation" | "oauth";
};

/**
 * Create and push a backup branch to GitHub
 */
async function createAndPushBackupBranch(
  context: ResolutionContext,
  branchName: string,
  fromRef?: string,
) {
  console.log(
    `[ResolutionExecutor] Creating backup branch: ${branchName}${fromRef ? ` from ${fromRef}` : ""}`,
  );
  await context.codebase.createBranch(branchName, fromRef);

  console.log("[ResolutionExecutor] Pushing backup branch to GitHub");

  await context.codebase.push(
    "github",
    branchName,
    false,
    context.githubToken,
    context.repoOwner,
    context.repoName,
  );

  logTokenUsage({
    operation: "resolution_backup_push",
    tokenType: context.githubTokenType,
    success: true,
    installationId:
      context.githubTokenType === "installation"
        ? context.installationId
        : undefined,
  });

  console.log(`[ResolutionExecutor] Backup branch pushed: ${branchName}`);
  return branchName;
}

/**
 * Fetch latest refs from GitHub
 */
async function fetchFromGitHub(context: ResolutionContext) {
  console.log("[ResolutionExecutor] Fetching latest from GitHub");

  await context.codebase.fetch(
    "github",
    context.githubToken,
    context.repoOwner,
    context.repoName,
  );

  logTokenUsage({
    operation: "resolution_fetch",
    tokenType: context.githubTokenType,
    success: true,
    installationId:
      context.githubTokenType === "installation"
        ? context.installationId
        : undefined,
  });
}

/**
 * Reset local repository to GitHub's version with verification
 */
async function resetToGitHubVersion(codebase: GitCodebase) {
  const githubCommit = await codebase.getCommitHash("github/main");
  console.log(
    `[ResolutionExecutor] Resetting to GitHub version: ${githubCommit}`,
  );

  await codebase.resetHard("github/main");

  // Verify the reset worked
  const newCommit = await codebase.getCommitHash("HEAD");
  console.log(`[ResolutionExecutor] Reset complete - now at ${newCommit}`);

  if (newCommit !== githubCommit) {
    throw new Error(
      `Reset verification failed - expected ${githubCommit}, got ${newCommit}`,
    );
  }
}

/**
 * Update upstream branch tracking (best effort, non-critical)
 */
async function updateUpstreamTracking(codebase: GitCodebase) {
  try {
    await codebase.setUpstreamBranch("github", "main", "main");
    console.log(
      "[ResolutionExecutor] Updated upstream tracking to github/main",
    );
  } catch (upstreamError) {
    console.log(
      "[ResolutionExecutor] Could not set upstream tracking (non-critical):",
      upstreamError,
    );
  }
}

/**
 * Strategy: Use GitHub's version, backup local work
 */
async function executeUseGitHubVersion(
  context: ResolutionContext,
  timestamp: number,
) {
  console.log(
    "[ResolutionExecutor] Using GitHub version - backing up local work",
  );

  const backupBranchName = `backup-local-${timestamp}`;

  // Create and push local backup
  await createAndPushBackupBranch(context, backupBranchName);

  // Checkout main and fetch latest
  console.log("[ResolutionExecutor] Checking out main branch");
  await context.codebase.checkoutBranch("main");
  await fetchFromGitHub(context);

  // Reset to GitHub's version
  await resetToGitHubVersion(context.codebase);

  // Install dependencies to fix any node_modules issues
  console.log("[ResolutionExecutor] Installing dependencies");
  await context.codebase.installDependencies();

  // Restart dev server to pick up newly installed dependencies
  if (hasDevServer(context.codebase)) {
    console.log("[ResolutionExecutor] Restarting dev server");
    await context.codebase.restartDevServer();
  }

  // Validate and fix cron intervals after resolution
  const { runCronValidationWithLogging } = await import(
    "../cronPostSyncValidator"
  );
  await runCronValidationWithLogging(
    context.ctx,
    context.codebase,
    context.projectId,
    context.githubToken,
    context.repoOwner,
    context.repoName,
    "ResolutionExecutor (GitHub)",
  );

  // Update upstream tracking
  await updateUpstreamTracking(context.codebase);

  return {
    success: true,
    message: `Successfully reset to GitHub version. Your local work is safely backed up in branch '${backupBranchName}'.`,
    backupBranch: backupBranchName,
  };
}

/**
 * Strategy: Use local version, backup GitHub work
 */
async function executeUseLocalVersion(
  context: ResolutionContext,
  timestamp: number,
) {
  console.log(
    "[ResolutionExecutor] Using local version - backing up GitHub work",
  );

  const backupBranchName = `backup-github-${timestamp}`;

  // Fetch latest GitHub refs
  await fetchFromGitHub(context);

  // Create and push backup of GitHub's current state
  await createAndPushBackupBranch(
    context,
    backupBranchName,
    "github/main", // Create backup from GitHub's version
  );

  // Validate and fix cron intervals before pushing
  const { runCronValidationWithLogging } = await import(
    "../cronPostSyncValidator"
  );
  await runCronValidationWithLogging(
    context.ctx,
    context.codebase,
    context.projectId,
    context.githubToken,
    context.repoOwner,
    context.repoName,
    "ResolutionExecutor (Local)",
  );

  // Force push local version to GitHub (will include any cron fixes)
  console.log("[ResolutionExecutor] Force pushing local version to GitHub");

  await context.codebase.push(
    "github",
    "main",
    true, // force push
    context.githubToken,
    context.repoOwner,
    context.repoName,
  );

  logTokenUsage({
    operation: "resolution_force_push",
    tokenType: context.githubTokenType,
    success: true,
    installationId:
      context.githubTokenType === "installation"
        ? context.installationId
        : undefined,
  });

  console.log("[ResolutionExecutor] Successfully force pushed local version");

  return {
    success: true,
    message: `Successfully pushed local version to GitHub. GitHub's previous state is safely backed up in branch '${backupBranchName}'.`,
    backupBranch: backupBranchName,
  };
}

/**
 * Execute divergence resolution based on user's chosen strategy
 */
export const executeResolution = internalAction({
  args: {
    projectId: v.id("project"),
    strategy: v.union(
      v.literal("use_github_version"),
      v.literal("use_local_version"),
    ),
    repoOwner: v.string(),
    repoName: v.string(),
    sandboxId: v.string(),
    githubToken: v.string(),
    githubTokenType: v.union(v.literal("installation"), v.literal("oauth")),
    installationId: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    backupBranch: v.string(),
  }),
  handler: async (ctx, args) => {
    console.log(
      `[ResolutionExecutor] Executing resolution strategy: ${args.strategy}`,
    );

    // Get project to retrieve package manager
    const project = await ctx.runQuery(internal.github.auth.getProjectDetails, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const packageManager = await getProjectPackageManager(ctx, project);

    const timestamp = Date.now();
    const codebase = await getGitCodebase(args.sandboxId, packageManager);

    // // Clean up any existing conflicted state first
    // console.log("[ResolutionExecutor] Cleaning up any conflicted git state");
    // try {
    //   await codebase.cleanupConflictedState();
    // } catch (cleanupError) {
    //   console.log(
    //     "[ResolutionExecutor] Cleanup reported issues (non-critical):",
    //     cleanupError,
    //   );
    // }

    // Build context object for helper functions
    const context: ResolutionContext = {
      ctx,
      codebase,
      projectId: args.projectId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      githubToken: args.githubToken,
      githubTokenType: args.githubTokenType,
      installationId: args.installationId,
    };

    try {
      if (args.strategy === "use_github_version") {
        return await executeUseGitHubVersion(context, timestamp);
      } else if (args.strategy === "use_local_version") {
        return await executeUseLocalVersion(context, timestamp);
      }

      throw new Error(`Unknown strategy: ${args.strategy}`);
    } catch (error: any) {
      console.error(
        `[ResolutionExecutor] Resolution failed for strategy ${args.strategy}:`,
        error,
      );
      return {
        success: false,
        message: `Resolution failed: ${error.message || error}`,
        backupBranch: "",
      };
    }
  },
});
