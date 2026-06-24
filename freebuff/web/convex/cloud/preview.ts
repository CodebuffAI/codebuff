"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { getAuthUser } from "../users";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";

/**
 * User-controlled preview (dev server) lifecycle for Freebuff Cloud
 * (connected-repo) projects.
 *
 * Unlike the old auto-detect-and-start flow, the dev server is NOT started
 * automatically when a repo is connected or reopened. The agent configures the
 * preview command (via the `freebuff-preview` tooling), and the user explicitly
 * starts / stops it here so they stay in control of sandbox resource usage.
 */

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

export const startPreview = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({
    running: v.boolean(),
    previewUrl: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ running: boolean; previewUrl?: string; message: string }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );

    if (!project.preview_command) {
      return {
        running: false,
        message:
          "No preview command is configured yet. Ask the agent to set one (e.g. \"set up the dev server\") or configure it in Settings.",
      };
    }

    await codebase.startPreviewProcess(project.preview_command);

    let previewUrl: string | undefined;
    if (project.preview_port) {
      try {
        previewUrl = await codebase.getPreviewLinkForPort(project.preview_port);
        await ctx.runMutation(
          internal.cloud.connectRepoMutations.setConnectedRepoPreviewUrl,
          { projectId: project._id, preview_url: previewUrl },
        );
      } catch (e) {
        console.warn("Failed to resolve preview URL after start:", e);
      }
    }

    return {
      running: true,
      previewUrl,
      message: "Dev server starting…",
    };
  },
});

export const stopPreview = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({ running: v.boolean(), message: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ running: boolean; message: string }> => {
    const { codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );
    await codebase.stopPreviewProcess();
    return { running: false, message: "Dev server stopped." };
  },
});

export const getPreviewRuntimeStatus = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({
    running: v.boolean(),
    previewCommand: v.union(v.string(), v.null()),
    previewPort: v.union(v.number(), v.null()),
    buildCommand: v.union(v.string(), v.null()),
    previewUrl: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    running: boolean;
    previewCommand: string | null;
    previewPort: number | null;
    buildCommand: string | null;
    previewUrl: string | null;
  }> => {
    const { project, codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );
    const running = await codebase.isPreviewProcessRunning();
    return {
      running,
      previewCommand: project.preview_command ?? null,
      previewPort: project.preview_port ?? null,
      buildCommand: project.build_command ?? null,
      previewUrl: project.preview_url ?? null,
    };
  },
});

export const setRuntimeConfig = action({
  args: {
    semanticIdentifier: v.string(),
    previewCommand: v.optional(v.string()),
    previewPort: v.optional(v.number()),
    buildCommand: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), message: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const project = await ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoForMember,
      { semanticIdentifier: args.semanticIdentifier, userId: user._id },
    );
    if (!project) throw new Error("Project not found or access denied");

    await ctx.runMutation(
      internal.cloud.connectRepoMutations.updateRuntimeConfig,
      {
        projectId: project._id,
        config: {
          ...(args.previewCommand !== undefined
            ? { preview_command: args.previewCommand }
            : {}),
          ...(args.previewPort !== undefined
            ? { preview_port: args.previewPort }
            : {}),
          ...(args.buildCommand !== undefined
            ? { build_command: args.buildCommand }
            : {}),
          detection_status: "ready",
        },
      },
    );

    return { success: true, message: "Saved configuration" };
  },
});

export const getPreviewLogs = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({ logs: v.string() }),
  handler: async (ctx, args): Promise<{ logs: string }> => {
    const { codebase } = await getMemberProjectCodebase(
      ctx,
      args.semanticIdentifier,
    );
    const logs = await codebase.getPreviewLogs(8000);
    return { logs: logs || "(no preview logs yet)" };
  },
});
