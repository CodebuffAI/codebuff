"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { stopDaytonaSandbox } from "../codebase-utils/instanceManager";

/**
 * Immediately STOP (pause) a project's Daytona VM. Used by the take-over flow so
 * the previously-active VM is freed right away rather than waiting for the idle
 * auto-stop. Best-effort — never throws.
 */
export const stopProjectSandbox = internalAction({
  args: { projectId: v.id("project") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });
    if (!project || !project.sandbox_id?.startsWith("daytona:")) {
      return null;
    }
    const daytonaServer =
      (project as { daytona_server?: "legacy" | "new" }).daytona_server ??
      "new";
    await stopDaytonaSandbox(project.sandbox_id, daytonaServer);
    return null;
  },
});
