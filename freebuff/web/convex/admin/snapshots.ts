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
    // Resource tier for the built snapshot. Defaults to the Cloud standard
    // 2 vCPU / 4 GB / 6 GB tier.
    //  - "cloud_standard" => Freebuff Cloud standard (6 GB); promoted to the
    //    "standard" primary and picked up automatically by connect-repo.
    //  - "web_standard"   => Freebuff Web standard (4 GB); used via the
    //    DAYTONA_SNAPSHOT_ID env var (NOT promoted to a warm-pool primary).
    //  - "small"          => limited-country tier (1 vCPU / 2 GB / 4 GB).
    //  - "xl"             => 8 GB storage-upgrade tier (built on demand,
    //    referenced by DAYTONA_SNAPSHOT_8GB_ID, not a warm-pool primary).
    tier: v.optional(
      v.union(
        v.literal("small"),
        v.literal("web_standard"),
        v.literal("cloud_standard"),
        v.literal("xl"),
      ),
    ),
    daytonaServer: v.optional(v.union(v.literal("legacy"), v.literal("new"))),
  },
  returns: v.object({ snapshotId: v.string(), recordId: v.string() }),
  handler: async (ctx, args): Promise<{ snapshotId: string; recordId: string }> => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Unauthorized: Admin access required");
    }

    const tierKey = args.tier ?? "cloud_standard";
    const resources = GOLDEN_RESOURCE_TIERS[tierKey];
    const server: DaytonaServer = args.daytonaServer ?? "new";

    const now = new Date();
    const version = `golden-${now.toISOString().slice(0, 10)}-${now.getTime()}`;
    const snapshotName = version;
    // DB tier stored on the record:
    //  "small" => limited; "cloud_standard" => Cloud standard (size class
    //  "standard", promotable); "web_standard" => Web standard (own size
    //  class, used via env, never a Cloud primary); "xl" => 8 GB storage
    //  upgrade (stored "medium").
    const tableTier =
      tierKey === "small"
        ? "small"
        : tierKey === "xl"
          ? "medium"
          : tierKey === "web_standard"
            ? "web_standard"
            : "large";

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
