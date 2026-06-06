"use node";

import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { DaytonaSdkManager } from "../../codebase-utils/codebase/DaytonaSdkManager";
import type { DaytonaServer } from "../../codebase-utils/codebase/DaytonaSdkManager";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

async function detectDaytonaServerForSandboxId(
  sandboxId: string,
): Promise<DaytonaServer> {
  const legacySdk = DaytonaSdkManager.getDaytonaSDK("legacy");
  const newSdk = DaytonaSdkManager.getDaytonaSDK("new");

  const [legacyResult, newResult] = await Promise.allSettled([
    legacySdk.get(sandboxId),
    newSdk.get(sandboxId),
  ]);

  const foundOnLegacy = legacyResult.status === "fulfilled";
  const foundOnNew = newResult.status === "fulfilled";

  console.log(
    `[DaytonaResolve] detect sandboxId=${sandboxId} foundOnLegacy=${foundOnLegacy} foundOnNew=${foundOnNew}`,
  );

  if (foundOnLegacy && !foundOnNew) {
    return "legacy";
  }
  if (foundOnNew && !foundOnLegacy) {
    return "new";
  }

  if (!foundOnLegacy && !foundOnNew) {
    throw new Error(
      `Sandbox ${sandboxId} not found on legacy or new Daytona servers`,
    );
  }

  throw new Error(
    `Sandbox ${sandboxId} appears on both Daytona servers (ambiguous)`,
  );
}

export const resolveProjectDaytonaServer = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<{ daytonaServer: DaytonaServer | null }> => {
    console.log(`[DaytonaResolve] start projectId=${args.projectId}`);
    const project: Doc<"project"> | null = await ctx.runQuery(
      internal.project.getProject,
      {
        projectId: args.projectId,
      },
    );

    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.sandbox_id.startsWith("daytona:")) {
      return { daytonaServer: null };
    }

    const migration = await ctx.runQuery(internal.project.getProjectDaytonaMigration, {
      projectId: project._id,
    });

    if (migration?.daytona_server) {
      console.log(
        `[DaytonaResolve] already set projectId=${project._id} daytona_server=${migration.daytona_server}`,
      );
      return { daytonaServer: migration.daytona_server };
    }

    const sandboxId = project.sandbox_id.slice("daytona:".length);
    if (!sandboxId) {
      throw new Error("Invalid Daytona sandbox id");
    }

    const detectedServer = await detectDaytonaServerForSandboxId(sandboxId);
    await ctx.runMutation(internal.project.setProjectDaytonaServer, {
      projectId: project._id,
      daytonaServer: detectedServer,
    });

    console.log(
      `[DaytonaResolve] resolved projectId=${project._id} detected=${detectedServer}`,
    );

    return { daytonaServer: detectedServer };
  },
});
