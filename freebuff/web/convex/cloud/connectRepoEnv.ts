"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";

/**
 * Environment-variable / config-file setup for Freebuff Cloud (connected-repo)
 * projects.
 *
 * Connected repos don't have a Vly-provisioned Convex backend, so env vars are
 * just files inside the cloned repo (typically `.env` / `.env.local`). This
 * lets the user paste secrets in the UI as a backup to editing them in the
 * hosted VS Code / terminal. `filePath` is restricted to the repo so it can't
 * be used to write arbitrary system paths.
 */

/** Reject path traversal / absolute paths so writes stay inside the repo. */
function normalizeSupportedEnvFilePath(filePath: string | undefined): string {
  const trimmed = (filePath || ".env").trim();
  if (trimmed !== ".env" && trimmed !== ".env.local") {
    throw new Error("Only .env and .env.local are supported in Cloud API Keys.");
  }
  return trimmed;
}

export const setConnectedRepoEnvVars = action({
  args: {
    semanticIdentifier: v.string(),
    // Raw file contents, e.g. "KEY=value\nOTHER=value".
    content: v.string(),
    // Defaults to ".env"; supports ".env.local" or other repo config files.
    filePath: v.optional(v.string()),
    // Restart the preview after writing so new env vars take effect.
    restartPreview: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    previewRestarted: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string; previewRestarted: boolean }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const project = await ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoForMember,
      { semanticIdentifier: args.semanticIdentifier },
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or access denied");
    }

    const filePath = normalizeSupportedEnvFilePath(args.filePath);

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
      "new",
    );
    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error("Connected repos require a Daytona-backed sandbox");
    }

    await codebase.writeFile(filePath, args.content);

    let previewRestarted = false;
    if (args.restartPreview && project.preview_command) {
      try {
        await codebase.startPreviewProcess(project.preview_command);
        previewRestarted = true;
      } catch (e) {
        console.warn("Failed to restart preview after env update:", e);
      }
    }

    return {
      success: true,
      message: `Saved ${filePath}`,
      previewRestarted,
    };
  },
});

export const getConnectedRepoEnvFile = action({
  args: {
    semanticIdentifier: v.string(),
    filePath: v.optional(v.string()),
  },
  returns: v.object({
    content: v.string(),
    exists: v.boolean(),
    filePath: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ content: string; exists: boolean; filePath: string }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const project = await ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoForMember,
      { semanticIdentifier: args.semanticIdentifier },
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or access denied");
    }

    const requestedFilePath = args.filePath
      ? normalizeSupportedEnvFilePath(args.filePath)
      : undefined;

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
      "new",
    );
    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error("Connected repos require a Daytona-backed sandbox");
    }

    const candidatePaths = requestedFilePath
      ? [requestedFilePath]
      : [".env", ".env.local"];

    for (const candidatePath of candidatePaths) {
      try {
        const content = await codebase.readFile(candidatePath);
        return { content, exists: true, filePath: candidatePath };
      } catch {
        // Try next candidate.
      }
    }

    return {
      content: "",
      exists: false,
      filePath: requestedFilePath ?? ".env",
    };
  },
});
