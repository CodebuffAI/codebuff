"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { logTokenUsage } from "../../tokens";
import { getGitCodebase } from "../../../../codebase-utils/codebase/codebaseHelper";
import type { SyncResult } from "../types";
import { runCronValidationWithLogging } from "../cronPostSyncValidator";
import { getProjectPackageManager } from "../../../../codebase-utils/packageManager";
import * as fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

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

const WEBCONTAINER_TOOL_TIMEOUT_MS = 120_000;
const WEBCONTAINER_READ_BATCH_SIZE = 100;

type PendingToolCall = {
  _id: string;
  status: "pending" | "done" | "error";
  output?: unknown;
  error?: string;
};

/**
 * Keep agent unblocked even when sync hits conflicts.
 */
async function keepAgentActive(
  ctx: any,
  projectId: string,
  reason: string,
): Promise<void> {
  try {
    await ctx.runMutation(internal.project.setStateDone, {
      projectId,
    });
    console.log(`[SyncExecutorService] Agent kept active: ${reason}`);
  } catch (stateError) {
    console.error(
      "[SyncExecutorService] Failed to keep agent active:",
      stateError,
    );
  }
}

function getGitHubReauthMessageIfNeeded(
  rawErrorMessage: string,
): string | undefined {
  const message = rawErrorMessage.toLowerCase();
  const isAuthFailure =
    message.includes("bad credentials") ||
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("token expired") ||
    message.includes("oauth token") ||
    message.includes("expired token") ||
    message.includes("installation token") ||
    message.includes("authentication failed") ||
    message.includes("resource not accessible by integration");

  if (!isAuthFailure) {
    return undefined;
  }

  return "GitHub authentication has expired or is invalid. Please reconnect GitHub and try syncing again.";
}

export { getGitHubReauthMessageIfNeeded };

async function waitForWebContainerToolCall(
  ctx: any,
  callId: string,
  timeoutMs: number,
): Promise<unknown> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const call = (await ctx.runQuery(
      internal.codesandbox.pendingToolCalls.getToolCallById,
      { callId },
    )) as PendingToolCall | null;

    if (!call) {
      throw new Error("WebContainer tool call disappeared before completion.");
    }

    if (call.status === "done") {
      return call.output;
    }

    if (call.status === "error") {
      throw new Error(call.error ?? "WebContainer tool execution failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await ctx.runMutation(internal.codesandbox.pendingToolCalls.failToolCall, {
    callId,
    error: "Timed out waiting for WebContainer tool execution.",
  });

  throw new Error("Timed out waiting for WebContainer tool execution.");
}

async function runWebContainerTool(
  ctx: any,
  args: {
    projectId: string;
    runId: string;
    toolName: string;
    input: unknown;
    timeoutMs?: number;
  },
): Promise<unknown> {
  const callId = await ctx.runMutation(
    internal.codesandbox.pendingToolCalls.enqueueToolCall,
    {
      runId: args.runId,
      projectId: args.projectId,
      toolName: args.toolName,
      input: args.input,
    },
  );

  return await waitForWebContainerToolCall(
    ctx,
    callId,
    args.timeoutMs ?? WEBCONTAINER_TOOL_TIMEOUT_MS,
  );
}

function normalizeSyncPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!normalized) return null;
  if (normalized.startsWith("../") || normalized.includes("/../")) return null;
  if (normalized === ".git" || normalized.startsWith(".git/")) return null;
  return normalized;
}

async function listWebContainerFiles(
  ctx: any,
  projectId: string,
  runId: string,
): Promise<string[]> {
  const raw = (await runWebContainerTool(ctx, {
    projectId,
    runId,
    toolName: "list_directory",
    input: { path: "." },
  })) as { files?: unknown; truncated?: unknown };

  const files = Array.isArray(raw?.files)
    ? raw.files.filter((value): value is string => typeof value === "string")
    : [];

  if (typeof raw?.truncated === "number" && raw.truncated > 0) {
    throw new Error(
      `WebContainer returned only a partial file listing (${raw.truncated} files truncated).`,
    );
  }

  const normalized = files
    .map((file) => normalizeSyncPath(file))
    .filter((file): file is string => !!file);

  return Array.from(new Set(normalized)).sort();
}

async function readWebContainerFiles(
  ctx: any,
  projectId: string,
  runId: string,
  filePaths: string[],
): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();

  for (let i = 0; i < filePaths.length; i += WEBCONTAINER_READ_BATCH_SIZE) {
    const batch = filePaths.slice(i, i + WEBCONTAINER_READ_BATCH_SIZE);
    const rawResult = (await runWebContainerTool(ctx, {
      projectId,
      runId,
      toolName: "read_files",
      input: { filePaths: batch },
    })) as Record<string, unknown> | null;

    if (!rawResult || typeof rawResult !== "object") {
      continue;
    }

    for (const filePath of batch) {
      const value = rawResult[filePath];
      if (typeof value === "string") {
        fileMap.set(filePath, value);
      }
    }
  }

  return fileMap;
}

async function cloneOrInitRepo(
  dir: string,
  repoUrl: string,
  token: string,
): Promise<void> {
  const auth = () => ({ username: "x-access-token", password: token });

  try {
    await git.clone({
      fs,
      http,
      dir,
      url: repoUrl,
      singleBranch: true,
      depth: 1,
      ref: "main",
      onAuth: auth,
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const isEmptyRepoError =
      normalized.includes("remote branch main not found") ||
      normalized.includes("could not find remote ref") ||
      normalized.includes("empty repository");

    if (!isEmptyRepoError) {
      throw error;
    }
  }

  await git.init({ fs, dir, defaultBranch: "main" });
  await git.addRemote({ fs, dir, remote: "origin", url: repoUrl });
}

async function syncWebContainerProjectToGitHub(
  ctx: any,
  args: {
    projectId: string;
    repoOwner: string;
    repoName: string;
    githubToken: string;
    githubTokenType: "installation" | "oauth";
    installationId?: number;
  },
): Promise<SyncResult> {
  const runId = `github-sync-webcontainer:${args.projectId}:${randomUUID()}`;
  const repoUrl = `https://github.com/${args.repoOwner}/${args.repoName}.git`;
  const tempDir = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "freebuff-wc-sync-"),
  );

  try {
    const files = await listWebContainerFiles(ctx, args.projectId, runId);
    const fileContents = await readWebContainerFiles(
      ctx,
      args.projectId,
      runId,
      files,
    );

    await cloneOrInitRepo(tempDir, repoUrl, args.githubToken);

    const trackedFiles = await git.listFiles({ fs, dir: tempDir });
    const desiredFiles = new Set(fileContents.keys());
    const filesToDelete = trackedFiles.filter((file) => !desiredFiles.has(file));

    for (const file of filesToDelete) {
      await fsPromises.rm(path.join(tempDir, file), { force: true });
    }

    for (const [file, contents] of fileContents.entries()) {
      const absolutePath = path.join(tempDir, file);
      await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fsPromises.writeFile(absolutePath, contents, "utf8");
    }

    for (const file of filesToDelete) {
      await git.remove({ fs, dir: tempDir, filepath: file }).catch(() => {});
    }

    for (const file of fileContents.keys()) {
      await git.add({ fs, dir: tempDir, filepath: file });
    }

    const statusMatrix = await git.statusMatrix({ fs, dir: tempDir });
    const hasChanges = statusMatrix.some((row) => row[1] !== row[3]);

    if (!hasChanges) {
      return {
        success: true,
        operation: "project_to_github",
        projectId: args.projectId,
        status: "synced",
        message: "Already up to date with GitHub.",
      };
    }

    await git.commit({
      fs,
      dir: tempDir,
      message: "Sync from Freebuff WebContainer",
      author: {
        name: "Freebuff WebContainer",
        email: "agent@mail.freebuff.app",
      },
    });

    await git.push({
      fs,
      http,
      dir: tempDir,
      remote: "origin",
      ref: "main",
      onAuth: () => ({ username: "x-access-token", password: args.githubToken }),
    });

    logTokenUsage({
      operation: "sync_executor_webcontainer_push",
      tokenType: args.githubTokenType,
      success: true,
      installationId:
        args.githubTokenType === "installation" ? args.installationId : undefined,
    });

    return {
      success: true,
      operation: "project_to_github",
      projectId: args.projectId,
      status: "synced",
      message: "WebContainer project pushed to GitHub successfully.",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const normalizedError = errorMessage.toLowerCase();
    const isConflictLikeError =
      normalizedError.includes("non-fast-forward") ||
      normalizedError.includes("fetch first") ||
      normalizedError.includes("failed to push some refs") ||
      normalizedError.includes("[rejected]");

    if (isConflictLikeError) {
      return {
        success: false,
        operation: "project_to_github",
        projectId: args.projectId,
        status: "conflict",
        message: `Push was rejected because GitHub has newer commits. ${errorMessage}`,
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

    const reauthMessage = getGitHubReauthMessageIfNeeded(errorMessage);
    return {
      success: false,
      operation: "project_to_github",
      projectId: args.projectId,
      status: "error",
      message: reauthMessage
        ? `${reauthMessage} (${errorMessage})`
        : `WebContainer GitHub push failed: ${errorMessage}`,
    };
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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
  await keepAgentActive(ctx, projectId, terminationReason);

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

    const normalizedError = errorMessage.toLowerCase();
    const isMergeConflict =
      normalizedError.includes("merge conflict") ||
      normalizedError.includes("automatic merge failed") ||
      normalizedError.includes("could not apply") ||
      normalizedError.includes("conflict (");

    if (!isMergeConflict) {
      console.error("[SyncExecutorService] Pull failed:", pullError);
      result.success = false;
      result.status = "error";
      const reauthMessage = getGitHubReauthMessageIfNeeded(errorMessage);
      result.message = reauthMessage
        ? `${reauthMessage} (${errorMessage})`
        : `GitHub pull failed: ${errorMessage}`;
      return result;
    }

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
    const pushErrorMessage = pushError?.message || String(pushError);
    const normalizedPushError = pushErrorMessage.toLowerCase();
    const isConflictLikePushError =
      normalizedPushError.includes("non-fast-forward") ||
      normalizedPushError.includes("fetch first") ||
      normalizedPushError.includes("failed to push some refs") ||
      normalizedPushError.includes("[rejected]");

    if (!isConflictLikePushError) {
      const reauthMessage = getGitHubReauthMessageIfNeeded(pushErrorMessage);
      return {
        success: false,
        operation: args.operation.type,
        projectId: args.operation.projectId,
        status: "error",
        message: reauthMessage
          ? `${reauthMessage} (${pushErrorMessage})`
          : `Push failed: ${pushErrorMessage}`,
      };
    }

    // If push fails, surface as conflict for user resolution
    return {
      success: false,
      operation: args.operation.type,
      projectId: args.operation.projectId,
      status: "conflict",
      message: `Push was rejected because GitHub has newer commits. ${pushErrorMessage}`,
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

        await keepAgentActive(
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

      if (pullResult.success && pullResult.status === "synced") {
        await ctx.runMutation(internal.project.setStateDone, {
          projectId: args.projectId,
        });
      }

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

      if (args.sandboxId.startsWith("webcontainer:")) {
        const webContainerResult = await syncWebContainerProjectToGitHub(ctx, {
          projectId: args.projectId,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          githubToken: args.githubToken,
          githubTokenType: args.githubTokenType,
          installationId: args.installationId,
        });

        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: webContainerResult.status as any,
          lastSyncTime: Date.now(),
          errorMessage: webContainerResult.success
            ? undefined
            : webContainerResult.message,
        });

        if (webContainerResult.status === "conflict") {
          await keepAgentActive(
            ctx,
            args.projectId,
            "webcontainer push conflict - user intervention required",
          );
        }

        if (webContainerResult.success && webContainerResult.status === "synced") {
          await ctx.runMutation(internal.project.setStateDone, {
            projectId: args.projectId,
          });
        }

        return webContainerResult;
      }

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

        await keepAgentActive(
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

      await ctx.runMutation(internal.project.setStateDone, {
        projectId: args.projectId,
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
