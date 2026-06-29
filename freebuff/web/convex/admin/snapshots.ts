"use node";

import { v } from "convex/values";
import { DaytonaSdkManager } from "../../codebase-utils/codebase/DaytonaSdkManager";
import type { DaytonaServer } from "../../codebase-utils/codebase/DaytonaSdkManager";
import {
  GOLDEN_RESOURCE_TIERS,
  GOLDEN_SNAPSHOT_ENTRYPOINT,
  buildGoldenImage,
} from "../../codebase-utils/golden-image";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";

/**
 * Admin: build a new golden Daytona snapshot from the declarative image.
 * Records a `daytona_snapshot` row, drives the Daytona snapshot build, and
 * marks the row `ready` (or `failed`). Promotion to `primary` is a separate,
 * explicit admin action.
 */
export const buildGoldenSnapshot = action({
  args: {
    // Resource tier for the built snapshot. Defaults to the standard
    // 2 vCPU / 4 GB / 4 GB tier; "small" is the limited-country tier.
    tier: v.optional(v.union(v.literal("small"), v.literal("full"))),
    daytonaServer: v.optional(v.union(v.literal("legacy"), v.literal("new"))),
  },
  returns: v.object({ snapshotId: v.string(), recordId: v.string() }),
  handler: async (ctx, args): Promise<{ snapshotId: string; recordId: string }> => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Unauthorized: Admin access required");
    }

    const tierKey = args.tier ?? "full";
    const resources = GOLDEN_RESOURCE_TIERS[tierKey];
    const server: DaytonaServer = args.daytonaServer ?? "new";

    const now = new Date();
    const version = `golden-${now.toISOString().slice(0, 10)}-${now.getTime()}`;
    const snapshotName = version;
    // "small" => limited-country tier; "full" => standard tier (stored "large").
    const tableTier = tierKey === "small" ? "small" : "large";

    const recordId = await ctx.runMutation(
      internal.admin.snapshot_mutations.createSnapshotRecord,
      {
        snapshot_id: snapshotName,
        name: resources.label,
        tier: tableTier,
        specs: {
          cpu: String(resources.cpu),
          ram: `${resources.memory}GB`,
          disk: `${resources.disk}GB`,
        },
        version,
        daytona_server: server,
        created_by: user._id,
      },
    );

    const logChunks: string[] = [];
    try {
      const daytona = DaytonaSdkManager.getDaytonaSDK(server);
      await daytona.snapshot.create(
        {
          name: snapshotName,
          image: buildGoldenImage(),
          resources: {
            cpu: resources.cpu,
            memory: resources.memory,
            disk: resources.disk,
          },
          entrypoint: GOLDEN_SNAPSHOT_ENTRYPOINT,
        },
        {
          timeout: 0,
          onLogs: (chunk: string) => {
            logChunks.push(chunk);
          },
        },
      );

      await ctx.runMutation(
        internal.admin.snapshot_mutations.updateSnapshotStatus,
        {
          id: recordId,
          status: "ready",
          build_logs: logChunks.join("").slice(-20_000),
        },
      );
    } catch (error) {
      await ctx.runMutation(
        internal.admin.snapshot_mutations.updateSnapshotStatus,
        {
          id: recordId,
          status: "failed",
          build_logs: logChunks.join("").slice(-20_000),
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }

    return { snapshotId: snapshotName, recordId };
  },
});
