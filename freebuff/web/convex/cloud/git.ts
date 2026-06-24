"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { getAuthUser } from "../users";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";

/**
 * Git integration for Freebuff Cloud (connected-repo) projects: branch status,
 * listing, switching, and creating branches. Commits / pushes / PRs are driven
 * by the agent (the UI fires a chat prompt for those), but lightweight branch
 * operations run here directly so the top-nav branch switcher feels instant.
 */

const BRANCH_NAME = /^[A-Za-z0-9._\-/]+$/;

function assertBranchName(branch: string): string {
  const trimmed = (branch || "").trim();
  if (!trimmed || !BRANCH_NAME.test(trimmed) || trimmed.includes("..")) {
    throw new Error("Invalid branch name.");
  }
  return trimmed;
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
