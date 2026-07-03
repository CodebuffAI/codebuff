"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { getAuthUser } from "../users";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import { escapeShellArg } from "../coding_agent/cli_agent/shellEscape";
import {
  createPullRequest as createGithubPullRequest,
  getInstallationToken,
} from "../../codebase-utils/github";

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

/**
 * Refresh the sandbox `origin` remote with a freshly-minted GitHub App
 * installation token before any network git op.
 *
 * The token embedded in `origin` at clone time expires after ~1 hour, which is
 * why "Sync"/push/PR started failing for longer-lived sandboxes with
 * "Invalid username or token. Password authentication is not supported".
 * Re-minting and rewriting the remote URL right before fetch/pull/push keeps
 * auth valid regardless of how long the sandbox has been alive.
 */
async function refreshOriginAuth(
  codebase: DaytonaCodebase,
  project: {
    repo_full_name?: string | null;
    github_installation_id?: number | null;
  },
): Promise<void> {
  if (!project.repo_full_name || !project.github_installation_id) return;
  let token: string;
  try {
    token = await getInstallationToken(project.github_installation_id);
  } catch (error) {
    console.error("[cloud/git] failed to mint installation token", error);
    throw new Error(
      "GitHub access has expired or the app was uninstalled. Please reconnect the repository from the Cloud page.",
    );
  }
  const remoteUrl = `https://x-access-token:${token}@github.com/${project.repo_full_name}.git`;
  await codebase.runCommand(
    `git remote set-url origin ${escapeShellArg(remoteUrl)}`,
    30_000,
  );
}

export type CloudGitStatus = {
  currentBranch: string;
  defaultBranch: string | null;
  branches: string[];
  isDirty: boolean;
  changedFiles: number;
  insertions: number;
  deletions: number;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  behindDefault: number;
  repoFullName: string | null;
};

/** Validator for the cached git status object (shared by schema + actions). */
const gitStatusValidator = {
  currentBranch: v.string(),
  defaultBranch: v.union(v.string(), v.null()),
  branches: v.array(v.string()),
  isDirty: v.boolean(),
  changedFiles: v.number(),
  insertions: v.number(),
  deletions: v.number(),
  ahead: v.number(),
  behind: v.number(),
  hasUpstream: v.boolean(),
  behindDefault: v.number(),
  repoFullName: v.union(v.string(), v.null()),
};

/** Split the labeled, single-exec status output into named sections. */
function splitSections(output: string): Record<string, string> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of (output || "").split(/\r?\n/)) {
    const marker = /^##([A-Z]+)##$/.exec(line.trim());
    if (marker) {
      current = marker[1];
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  const joined: Record<string, string> = {};
  for (const key of Object.keys(sections)) {
    joined[key] = sections[key].join("\n").trim();
  }
  return joined;
}

function parseShortstat(line: string): {
  insertions: number;
  deletions: number;
} {
  const ins = /(\d+)\s+insertion/.exec(line || "");
  const del = /(\d+)\s+deletion/.exec(line || "");
  return {
    insertions: ins ? parseInt(ins[1], 10) : 0,
    deletions: del ? parseInt(del[1], 10) : 0,
  };
}

/** Parse `git rev-list --left-right --count A...B` => { left, right }. */
function parseLeftRight(
  line: string,
): { left: number; right: number } | null {
  const m = /(\d+)\s+(\d+)/.exec((line || "").trim());
  if (!m) return null;
  return { left: parseInt(m[1], 10), right: parseInt(m[2], 10) };
}

/**
 * Compute the full git status in a SINGLE sandbox exec. Batching every read
 * into one labeled script (instead of 5-6 separate runCommand round-trips)
 * keeps the per-refresh sandbox cost minimal. Ahead/behind are relative to the
 * last-known remote refs (no network fetch here) so status stays cheap; the
 * Sync action is what actually fetches.
 */
async function computeGitStatus(
  codebase: DaytonaCodebase,
  defaultBranch: string | null,
  repoFullName: string | null,
  fallbackBranch: string | null,
): Promise<CloudGitStatus> {
  const def = defaultBranch ?? "main";
  const command = [
    "printf '##BRANCH##\\n'",
    "git rev-parse --abbrev-ref HEAD 2>/dev/null",
    "printf '##REFS##\\n'",
    "git for-each-ref --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null",
    "printf '##PORC##\\n'",
    "git status --porcelain 2>/dev/null",
    "printf '##UNSTAGED##\\n'",
    "git diff --shortstat 2>/dev/null",
    "printf '##STAGED##\\n'",
    "git diff --cached --shortstat 2>/dev/null",
    "printf '##UP##\\n'",
    "git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null",
    "printf '##DEF##\\n'",
    `git rev-list --left-right --count origin/${escapeShellArg(def)}...HEAD 2>/dev/null`,
    "printf '##END##\\n'",
  ].join("; ");

  const result = await codebase.runCommand(command, 20_000);
  const s = splitSections(result.output);

  const currentBranch = (s.BRANCH || "").trim() || fallbackBranch || "main";

  const branches = Array.from(
    new Set(
      (s.REFS || "")
        .split(/\r?\n/)
        .map((b) => b.trim().replace(/^origin\//, ""))
        .filter((b) => b && b !== "HEAD" && !b.includes("->")),
    ),
  ).sort();

  const changedFiles = (s.PORC || "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0).length;

  const unstaged = parseShortstat(s.UNSTAGED || "");
  const staged = parseShortstat(s.STAGED || "");

  const upstream = parseLeftRight(s.UP || "");
  const fromDefault = parseLeftRight(s.DEF || "");

  return {
    currentBranch,
    defaultBranch: defaultBranch ?? null,
    branches: branches.length > 0 ? branches : [currentBranch],
    isDirty: changedFiles > 0,
    changedFiles,
    insertions: unstaged.insertions + staged.insertions,
    deletions: unstaged.deletions + staged.deletions,
    ahead: upstream?.right ?? 0,
    behind: upstream?.left ?? 0,
    hasUpstream: upstream != null,
    behindDefault: fromDefault?.left ?? 0,
    repoFullName,
  };
}

/** Persist the freshly computed status so the reactive query can serve it
 *  without ever waking the sandbox. */
async function cacheGitStatus(
  ctx: ActionCtx,
  projectId: string,
  status: CloudGitStatus,
): Promise<void> {
  await ctx.runMutation(internal.cloud.connectRepoMutations.setGitStatusCache, {
    projectId: projectId as never,
    status,
  });
}

/** Recompute + cache status from an already-resolved project/codebase. Used by
 *  the mutating actions so a single sandbox session both performs the op and
 *  refreshes the cache (the reactive query then updates with no extra call). */
async function refreshStatus(
  ctx: ActionCtx,
  project: {
    _id: string;
    repo_default_branch?: string | null;
    repo_full_name?: string | null;
    current_branch?: string | null;
  },
  codebase: DaytonaCodebase,
): Promise<CloudGitStatus> {
  const status = await computeGitStatus(
    codebase,
    project.repo_default_branch ?? null,
    project.repo_full_name ?? null,
    project.current_branch ?? null,
  );
  await cacheGitStatus(ctx, project._id, status);
  return status;
}

async function getMemberProjectCodebase(
  ctx: ActionCtx,
  semanticIdentifier: string,
) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const project = await ctx.runQuery(
    internal.cloud.connectRepoMutations.getConnectedRepoForMember,
    { semanticIdentifier },
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
  returns: v.object(gitStatusValidator),
  handler: async (ctx, args): Promise<CloudGitStatus> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const status = await computeGitStatus(
      codebase,
      project.repo_default_branch ?? null,
      project.repo_full_name ?? null,
      project.current_branch ?? null,
    );

    // Keep the persisted current branch in sync with reality.
    if (status.currentBranch && status.currentBranch !== project.current_branch) {
      await ctx.runMutation(
        internal.cloud.connectRepoMutations.setCurrentBranch,
        { projectId: project._id, branch: status.currentBranch },
      );
    }

    await cacheGitStatus(ctx, project._id, status);

    return status;
  },
});

/** Cap the returned diff so huge working trees don't blow up the action
 *  return size or the dialog that renders it. */
const MAX_DIFF_CHARS = 400_000;

/**
 * Full uncommitted diff for the working tree in a SINGLE sandbox exec:
 * staged + unstaged changes vs HEAD, plus untracked files rendered as
 * additions (via --no-index against /dev/null). Read-only — backs the
 * "lines changed" chip in the Cloud top bar.
 */
export const getGitDiff = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({ diff: v.string(), truncated: v.boolean() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ diff: string; truncated: boolean }> => {
    const { codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const command = [
      "git --no-pager diff HEAD 2>/dev/null",
      "git ls-files --others --exclude-standard -z 2>/dev/null | xargs -0 -r -I{} git --no-pager diff --no-index -- /dev/null {} 2>/dev/null",
      // xargs exits non-zero because --no-index diffs exit 1 on differences;
      // the output is still what we want.
      "true",
    ].join("; ");

    const result = await codebase.runCommand(command, 30_000);
    const output = result.output ?? "";
    const truncated = output.length > MAX_DIFF_CHARS;
    return {
      diff: truncated ? output.slice(0, MAX_DIFF_CHARS) : output,
      truncated,
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
      await refreshOriginAuth(codebase, project);
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
    await refreshStatus(ctx, { ...project, current_branch: branch }, codebase);

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
    await refreshStatus(ctx, { ...project, current_branch: branch }, codebase);

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
      const status = await refreshStatus(ctx, project, codebase);
      return {
        success: true,
        currentBranch: status.currentBranch,
        changedFiles: status.changedFiles,
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
    const status = await refreshStatus(ctx, project, codebase);

    return {
      success: true,
      currentBranch: status.currentBranch,
      changedFiles: status.changedFiles,
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
    await refreshOriginAuth(codebase, project);
    // -u sets the upstream so subsequent ahead/behind status is accurate.
    const pushResult = await codebase.runCommand(
      `git push -u origin ${escapeShellArg(currentBranch)}`,
      120_000,
    );

    if (pushResult.exitCode && pushResult.exitCode !== 0) {
      const status = await refreshStatus(ctx, project, codebase);
      return {
        success: false,
        currentBranch,
        changedFiles: status.changedFiles,
        message: summarizeOutput(pushResult.output) || `Failed to push ${currentBranch}.`,
      };
    }

    await ctx.runMutation(internal.cloud.connectRepoMutations.setCurrentBranch, {
      projectId: project._id,
      branch: currentBranch,
    });
    const status = await refreshStatus(ctx, project, codebase);

    return {
      success: true,
      currentBranch,
      changedFiles: status.changedFiles,
      message: summarizeOutput(pushResult.output) || `Pushed ${currentBranch}.`,
    };
  },
});

/**
 * Stage + commit (only when there are changes) and push the current branch in
 * a SINGLE sandbox session. Combines what used to be two round-trips (commit
 * then push) so the "Commit & push" button performs one efficient operation.
 * When the tree is clean it just pushes any unpushed commits.
 */
export const commitAndPush = action({
  args: {
    semanticIdentifier: v.string(),
    message: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    currentBranch: v.string(),
    changedFiles: v.number(),
    committed: v.boolean(),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    currentBranch: string;
    changedFiles: number;
    committed: boolean;
    message: string;
  }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const currentBranch = await getCurrentBranch(codebase);

    await codebase.runCommand("git add -A", 30_000);
    const stagedResult = await codebase.runCommand(
      "git diff --cached --name-only",
      10_000,
    );
    const stagedFiles = stagedResult.output
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    let committed = false;
    if (stagedFiles.length > 0) {
      const commitMessage = (args.message ?? "").trim();
      if (!commitMessage) {
        const status = await refreshStatus(ctx, project, codebase);
        return {
          success: false,
          currentBranch,
          changedFiles: status.changedFiles,
          committed: false,
          message: "Commit message is required.",
        };
      }
      const commitResult = await codebase.runCommand(
        `git commit -m ${escapeShellArg(commitMessage)}`,
        60_000,
      );
      if (commitResult.exitCode && commitResult.exitCode !== 0) {
        const status = await refreshStatus(ctx, project, codebase);
        return {
          success: false,
          currentBranch,
          changedFiles: status.changedFiles,
          committed: false,
          message:
            summarizeOutput(commitResult.output) ||
            "Commit failed. Please verify git user name/email and try again.",
        };
      }
      committed = true;
    }

    await refreshOriginAuth(codebase, project);
    // -u sets the upstream so subsequent ahead/behind status is accurate.
    const pushResult = await codebase.runCommand(
      `git push -u origin ${escapeShellArg(currentBranch)}`,
      120_000,
    );

    await ctx.runMutation(internal.cloud.connectRepoMutations.setCurrentBranch, {
      projectId: project._id,
      branch: currentBranch,
    });
    const status = await refreshStatus(ctx, project, codebase);

    if (pushResult.exitCode && pushResult.exitCode !== 0) {
      return {
        success: false,
        currentBranch,
        changedFiles: status.changedFiles,
        committed,
        message:
          summarizeOutput(pushResult.output) ||
          (committed
            ? `Committed ${stagedFiles.length} file(s), but failed to push ${currentBranch}.`
            : `Failed to push ${currentBranch}.`),
      };
    }

    return {
      success: true,
      currentBranch,
      changedFiles: status.changedFiles,
      committed,
      message: committed
        ? `Committed ${stagedFiles.length} file(s) and pushed ${currentBranch}.`
        : `Pushed ${currentBranch}.`,
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
    await refreshOriginAuth(codebase, project);
    // Fetch all so ahead/behind vs the default branch is fresh after sync.
    const syncResult = await codebase.runCommand(
      `git fetch origin && git pull --rebase origin ${escapeShellArg(currentBranch)}`,
      120_000,
    );

    if (syncResult.exitCode && syncResult.exitCode !== 0) {
      const status = await refreshStatus(ctx, project, codebase);
      return {
        success: false,
        currentBranch,
        changedFiles: status.changedFiles,
        message:
          summarizeOutput(syncResult.output) ||
          `Failed to sync ${currentBranch} from remote.`,
      };
    }

    await ctx.runMutation(internal.cloud.connectRepoMutations.setCurrentBranch, {
      projectId: project._id,
      branch: currentBranch,
    });
    const status = await refreshStatus(ctx, project, codebase);

    return {
      success: true,
      currentBranch,
      changedFiles: status.changedFiles,
      message: summarizeOutput(syncResult.output) || `Synced ${currentBranch} from remote.`,
    };
  },
});

/**
 * Push the current branch and open (or reuse) a pull request into the repo's
 * default branch. Idempotent: re-running returns the existing open PR. The
 * branch must differ from the default branch.
 */
export const createPullRequest = action({
  args: {
    semanticIdentifier: v.string(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    url: v.union(v.string(), v.null()),
    currentBranch: v.string(),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    url: string | null;
    currentBranch: string;
    message: string;
  }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    const currentBranch = await getCurrentBranch(codebase);
    const base = project.repo_default_branch ?? "main";

    if (!project.repo_full_name || !project.github_installation_id) {
      return {
        success: false,
        url: null,
        currentBranch,
        message: "This project isn't linked to a GitHub repo.",
      };
    }

    if (currentBranch === base) {
      return {
        success: false,
        url: null,
        currentBranch,
        message: `You're on ${base}. Create a branch before opening a pull request.`,
      };
    }

    await refreshOriginAuth(codebase, project);
    // Push the branch so the PR head exists on the remote.
    const pushResult = await codebase.runCommand(
      `git push -u origin ${escapeShellArg(currentBranch)}`,
      120_000,
    );
    if (pushResult.exitCode && pushResult.exitCode !== 0) {
      await refreshStatus(ctx, project, codebase);
      return {
        success: false,
        url: null,
        currentBranch,
        message:
          summarizeOutput(pushResult.output) ||
          `Couldn't push ${currentBranch} to open a pull request.`,
      };
    }

    const subjectResult = await codebase.runCommand(
      "git log -1 --pretty=%s 2>/dev/null",
      10_000,
    );
    const title =
      args.title?.trim() || subjectResult.output.trim() || currentBranch;

    try {
      const pr = await createGithubPullRequest({
        installationId: project.github_installation_id,
        repoFullName: project.repo_full_name,
        head: currentBranch,
        base,
        title,
        body: args.body,
      });
      await refreshStatus(ctx, project, codebase);
      return {
        success: true,
        url: pr.url,
        currentBranch,
        message: pr.existing
          ? `A pull request for ${currentBranch} is already open.`
          : `Opened pull request for ${currentBranch}.`,
      };
    } catch (error) {
      return {
        success: false,
        url: null,
        currentBranch,
        message:
          error instanceof Error
            ? error.message
            : `Failed to open a pull request for ${currentBranch}.`,
      };
    }
  },
});
