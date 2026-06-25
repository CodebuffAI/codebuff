"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { getAuthUser } from "../users";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import { escapeShellArg } from "../coding_agent/cli_agent/shellEscape";

/**
 * Git integration for Freebuff Cloud (connected-repo) projects: branch status,
 * listing/switching/creating branches, committing, pushing, and syncing from
 * remote. All operations run directly in the project sandbox.
 */

const BRANCH_NAME = /^[A-Za-z0-9._\-/]+$/;

function assertBranchName(branch: string): string {
  const trimmed = (branch || "").trim();
  if (!trimmed || !BRANCH_NAME.test(trimmed) || trimmed.includes("..")) {
    throw new Error("Invalid branch name.");
  }
  return trimmed;
}

function assertCommitMessage(message: string): string {
  const trimmed = (message || "").trim();
  if (!trimmed) {
    throw new Error("Commit message is required.");
  }
  return trimmed;
}

function summarizeOutput(output: string, maxChars = 320): string {
  const trimmed = (output || "").trim();
  if (!trimmed) return "";
  return trimmed.length > maxChars
    ? `${trimmed.slice(trimmed.length - maxChars)}`
    : trimmed;
}

async function getCurrentBranch(codebase: DaytonaCodebase): Promise<string> {
  const branchResult = await codebase.runCommand(
    "git rev-parse --abbrev-ref HEAD",
    10_000,
  );
  return branchResult.output.trim() || "main";
}

async function getMemberProjectCodebase(
  ctx: ActionCtx,
  semanticIdentifier: string,
) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const project = await ctx.runQuery(
    internal.cloud.connectRepoMutations.getConnectedRepoForMember,
    { semanticIdentifier, userId: user._id },
  );
  if (!project || !project.sandbox_id) {
    throw new Error("Project not found or access denied");
  }

  const codebase = await initializeCodebase(
    project.sandbox_id,
    project.packageManager,
    "new",
  );
  if (!(codebase instanceof DaytonaCodebase)) {
    throw new Error("Connected repos require a Daytona-backed sandbox");
  }

  return { project, codebase };
}

export const getGitStatus = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({
    currentBranch: v.string(),
    defaultBranch: v.union(v.string(), v.null()),
    branches: v.array(v.string()),
    isDirty: v.boolean(),
    changedFiles: v.number(),
    repoFullName: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    currentBranch: string;
    defaultBranch: string | null;
    branches: string[];
    isDirty: boolean;
    changedFiles: number;
    repoFullName: string | null;
  }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const branchResult = await codebase.runCommand(
      "git rev-parse --abbrev-ref HEAD",
      10_000,
    );
    const currentBranch =
      branchResult.output.trim() || project.current_branch || "main";

    const branchListResult = await codebase.runCommand(
      "git for-each-ref --format='%(refname:short)' refs/heads refs/remotes",
      10_000,
    );
    const branches = Array.from(
      new Set(
        branchListResult.output
          .split(/\r?\n/)
          .map((b) => b.trim().replace(/^origin\//, ""))
          .filter((b) => b && b !== "HEAD" && !b.includes("->")),
      ),
    ).sort();

    const statusResult = await codebase.runCommand(
      "git status --porcelain",
      10_000,
    );
    const changedFiles = statusResult.output
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0).length;

    // Keep the persisted current branch in sync with reality.
    if (currentBranch && currentBranch !== project.current_branch) {
      await ctx.runMutation(
        internal.cloud.connectRepoMutations.setCurrentBranch,
        { projectId: project._id, branch: currentBranch },
      );
    }

    return {
      currentBranch,
      defaultBranch: project.repo_default_branch ?? null,
      branches: branches.length > 0 ? branches : [currentBranch],
      isDirty: changedFiles > 0,
      changedFiles,
      repoFullName: project.repo_full_name ?? null,
    };
  },
});

export const switchBranch = action({
  args: { semanticIdentifier: v.string(), branch: v.string() },
  returns: v.object({ success: v.boolean(), currentBranch: v.string(), message: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; currentBranch: string; message: string }> => {
    const branch = assertBranchName(args.branch);
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    // Try a local checkout first; if the branch only exists on the remote
    // (the clone is shallow / single-branch), fetch it and check out.
    let result = await codebase.runCommand(
      `git checkout ${branch}`,
      60_000,
    );
    if (result.exitCode && result.exitCode !== 0) {
      result = await codebase.runCommand(
        `git fetch origin ${branch} && git checkout -B ${branch} origin/${branch}`,
        120_000,
      );
    }
    if (result.exitCode && result.exitCode !== 0) {
      return {
        success: false,
        currentBranch: project.current_branch ?? "main",
        message: `Could not switch to ${branch}: ${result.output.slice(-300)}`,
      };
    }

    await ctx.runMutation(
      internal.cloud.connectRepoMutations.setCurrentBranch,
      { projectId: project._id, branch },
    );

    return { success: true, currentBranch: branch, message: `Switched to ${branch}` };
  },
});

export const createBranch = action({
  args: { semanticIdentifier: v.string(), branch: v.string() },
  returns: v.object({ success: v.boolean(), currentBranch: v.string(), message: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; currentBranch: string; message: string }> => {
    const branch = assertBranchName(args.branch);
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const result = await codebase.runCommand(
      `git checkout -b ${branch}`,
      60_000,
    );
    if (result.exitCode && result.exitCode !== 0) {
      return {
        success: false,
        currentBranch: project.current_branch ?? "main",
        message: `Could not create ${branch}: ${result.output.slice(-300)}`,
      };
    }

    await ctx.runMutation(
      internal.cloud.connectRepoMutations.setCurrentBranch,
      { projectId: project._id, branch },
    );

    return { success: true, currentBranch: branch, message: `Created and switched to ${branch}` };
  },
});

export const commitChanges = action({
  args: {
    semanticIdentifier: v.string(),
    message: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    currentBranch: v.string(),
    changedFiles: v.number(),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    currentBranch: string;
    changedFiles: number;
    message: string;
  }> => {
    const commitMessage = assertCommitMessage(args.message);
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    await codebase.runCommand("git add -A", 30_000);

    const stagedResult = await codebase.runCommand(
      "git diff --cached --name-only",
      10_000,
    );
    const stagedFiles = stagedResult.output
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    const currentBranch = await getCurrentBranch(codebase);

    if (stagedFiles.length === 0) {
      const statusResult = await codebase.runCommand("git status --porcelain", 10_000);
      const changedFiles = statusResult.output
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0).length;
      return {
        success: true,
        currentBranch,
        changedFiles,
        message: "No changes to commit.",
      };
    }

    const commitResult = await codebase.runCommand(
      `git commit -m ${escapeShellArg(commitMessage)}`,
      60_000,
    );
    if (commitResult.exitCode && commitResult.exitCode !== 0) {
      return {
        success: false,
        currentBranch,
        changedFiles: stagedFiles.length,
        message:
          summarizeOutput(commitResult.output) ||
          "Commit failed. Please verify git user name/email and try again.",
      };
    }

    await ctx.runMutation(internal.cloud.connectRepoMutations.setCurrentBranch, {
      projectId: project._id,
      branch: currentBranch,
    });

    return {
      success: true,
      currentBranch,
      changedFiles: 0,
      message: summarizeOutput(commitResult.output) || "Committed changes.",
    };
  },
});

export const pushCurrentBranch = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({
    success: v.boolean(),
    currentBranch: v.string(),
    changedFiles: v.number(),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    currentBranch: string;
    changedFiles: number;
    message: string;
  }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const currentBranch = await getCurrentBranch(codebase);
    const pushResult = await codebase.runCommand(
      `git push origin ${escapeShellArg(currentBranch)}`,
      120_000,
    );

    const statusResult = await codebase.runCommand("git status --porcelain", 10_000);
    const changedFiles = statusResult.output
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0).length;

    if (pushResult.exitCode && pushResult.exitCode !== 0) {
      return {
        success: false,
        currentBranch,
        changedFiles,
        message: summarizeOutput(pushResult.output) || `Failed to push ${currentBranch}.`,
      };
    }

    await ctx.runMutation(internal.cloud.connectRepoMutations.setCurrentBranch, {
      projectId: project._id,
      branch: currentBranch,
    });

    return {
      success: true,
      currentBranch,
      changedFiles,
      message: summarizeOutput(pushResult.output) || `Pushed ${currentBranch}.`,
    };
  },
});

export const syncFromRemote = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({
    success: v.boolean(),
    currentBranch: v.string(),
    changedFiles: v.number(),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    currentBranch: string;
    changedFiles: number;
    message: string;
  }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const currentBranch = await getCurrentBranch(codebase);
    const syncResult = await codebase.runCommand(
      `git pull --rebase origin ${escapeShellArg(currentBranch)}`,
      120_000,
    );

    const statusResult = await codebase.runCommand("git status --porcelain", 10_000);
    const changedFiles = statusResult.output
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0).length;

    if (syncResult.exitCode && syncResult.exitCode !== 0) {
      return {
        success: false,
        currentBranch,
        changedFiles,
        message:
          summarizeOutput(syncResult.output) ||
          `Failed to sync ${currentBranch} from remote.`,
      };
    }

    await ctx.runMutation(internal.cloud.connectRepoMutations.setCurrentBranch, {
      projectId: project._id,
      branch: currentBranch,
    });

    return {
      success: true,
      currentBranch,
      changedFiles,
      message: summarizeOutput(syncResult.output) || `Synced ${currentBranch} from remote.`,
    };
  },
});
