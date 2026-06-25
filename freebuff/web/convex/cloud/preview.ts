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

/**
 * One-shot snapshot of the dev-server state for the workspace UI. Combines:
 *  - `running`:   the preview process session is still executing.
 *  - `listening`: the dev server is actually answering HTTP on its port. We
 *    probe `localhost:<port>` from inside the sandbox (via curl) so we bypass
 *    the Daytona proxy entirely — that proxy returns a 400 "Is the Sandbox
 *    started?" page while the container/dev-server is still coming up, which is
 *    exactly the screen we don't want to surface in the iframe.
 *  - `logs`:      recent dev-server output so the UI can stream errors.
 *
 * The client polls this while starting and only mounts the preview iframe once
 * `listening` flips true, so users never see the proxy error page.
 */
export const getPreviewState = action({
  args: { semanticIdentifier: v.string() },
  returns: v.object({
    running: v.boolean(),
    listening: v.boolean(),
    statusCode: v.union(v.string(), v.null()),
    logs: v.string(),
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
    listening: boolean;
    statusCode: string | null;
    logs: string;
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
    const port = project.preview_port ?? null;

    let listening = false;
    let statusCode: string | null = null;
    if (port) {
      try {
        const probe = await codebase.runCommand(
          `curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://localhost:${port}" 2>/dev/null || echo 000`,
          12000,
        );
        const match = probe.output.trim().match(/(\d{3})\s*$/);
        statusCode = match ? match[1] : null;
        // Any HTTP response (even 404/500 from the app) means the dev server is
        // up and bound to the port. "000" is curl's "couldn't connect".
        listening = !!statusCode && statusCode !== "000";
      } catch (e) {
        console.warn("Preview port probe failed:", e);
        listening = false;
      }
    }

    const logs = await codebase.getPreviewLogs(8000);

    return {
      running,
      listening,
      statusCode,
      logs: logs || "",
      previewCommand: project.preview_command ?? null,
      previewPort: port,
      buildCommand: project.build_command ?? null,
      previewUrl: project.preview_url ?? null,
    };
  },
});
