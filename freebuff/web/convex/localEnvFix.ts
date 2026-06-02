"use node";

import { internal } from "!/_generated/api";
import { createDeployKey } from "!/convex_management";
import { v } from "convex/values";
import { CSBCodebase } from "../codebase-utils/codebase/CSBCodebase";
import { internalAction } from "./_generated/server";

export const restoreEnvLocal = internalAction({
  args: {
    projectId: v.id("project"),
    devDeploymentName: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Skip restoreEnvLocal for Daytona sandboxes - they don't need this
    if (project.sandbox_id.startsWith("daytona:")) {
      console.log(
        "Skipping restoreEnvLocal for Daytona sandbox:",
        project.sandbox_id,
      );
      return;
    }

    const codebase = await CSBCodebase.create(project.sandbox_id);
    const result = await codebase.runCommand("ls .env.local");
    if (result.exitCode !== 0) {
      await codebase.writeFile(
        ".env.local",
        `CONVEX_DEPLOYMENT=dev:${args.devDeploymentName}\nVITE_CONVEX_URL=https://${args.devDeploymentName}.convex.cloud\n`,
      );
    }

    const keyResult = await codebase.runCommand("ls $HOME/.vly-convex/dev.key");
    if (keyResult.exitCode !== 0) {
      console.log("No dev key found, creating one");
      const deploymentKey = await createDeployKey(args.devDeploymentName);
      const result = await codebase.runCommand(
        `mkdir -p $HOME/.vly-convex && echo "${deploymentKey}" > $HOME/.vly-convex/dev.key`,
      );
    }

    await codebase.restartDevServer();
  },
});
