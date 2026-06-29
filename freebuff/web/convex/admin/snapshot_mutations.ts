import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { getAuthUser } from "../users";

function requireAdmin(user: Doc<"users"> | null): Doc<"users"> {
  if (!user || (user.role !== "god" && user.role !== "admin")) {
    throw new Error("Unauthorized: Admin access required");
  }
  return user;
}

const tierValidator = v.union(
  v.literal("small"),
  v.literal("medium"),
  v.literal("large"),
);

const statusValidator = v.union(
  v.literal("building"),
  v.literal("ready"),
  v.literal("primary"),
  v.literal("failed"),
);

/** Admin: list all golden snapshots, newest first. */
export const listSnapshots = query({
  args: {},
  handler: async (ctx) => {
    requireAdmin(await getAuthUser(ctx));
    const rows = await ctx.db.query("daytona_snapshot").collect();
    return rows.sort((a, b) => b.created_at - a.created_at);
  },
});

/** Internal: create a snapshot record in the `building` state. */
export const createSnapshotRecord = internalMutation({
  args: {
    snapshot_id: v.string(),
    name: v.string(),
    tier: tierValidator,
    specs: v.object({
      cpu: v.string(),
      ram: v.string(),
      disk: v.string(),
    }),
    version: v.string(),
    daytona_server: v.optional(v.union(v.literal("legacy"), v.literal("new"))),
    created_by: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("daytona_snapshot", {
      ...args,
      status: "building" as const,
      created_at: Date.now(),
    });
  },
});

/** Internal: update a snapshot record's status/logs. */
export const updateSnapshotStatus = internalMutation({
  args: {
    id: v.id("daytona_snapshot"),
    status: statusValidator,
    build_logs: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

/** Standard (large) vs limited-country (small) size class for a snapshot. */
function sizeClassOf(tier: "small" | "medium" | "large"): "small" | "standard" {
  return tier === "small" ? "small" : "standard";
}

/**
 * Admin: promote a `ready` snapshot to `primary`. The previous primary of the
 * SAME size class (standard vs limited) is demoted to `ready`. There is one
 * primary per size class so limited countries can run a smaller snapshot.
 */
export const promoteSnapshotToPrimary = mutation({
  args: { id: v.id("daytona_snapshot") },
  handler: async (ctx, args) => {
    requireAdmin(await getAuthUser(ctx));

    const target = await ctx.db.get(args.id);
    if (!target) {
      throw new Error("Snapshot not found");
    }
    if (target.status !== "ready" && target.status !== "primary") {
      throw new Error("Only a ready snapshot can be promoted");
    }

    const targetClass = sizeClassOf(target.tier);
    const currentPrimaries = await ctx.db
      .query("daytona_snapshot")
      .withIndex("by_status", (q) => q.eq("status", "primary"))
      .collect();
    for (const row of currentPrimaries) {
      if (row._id !== args.id && sizeClassOf(row.tier) === targetClass) {
        await ctx.db.patch(row._id, { status: "ready" as const });
      }
    }

    await ctx.db.patch(args.id, {
      status: "primary" as const,
      promoted_at: Date.now(),
    });
  },
});

/**
 * Admin: delete a snapshot record from Convex.
 *
 * Safety rule: primary snapshots cannot be deleted directly because they are
 * active bases for new sandbox creation. Promote another snapshot of the same
 * size class first, then delete the previous one.
 */
export const deleteSnapshot = mutation({
  args: { id: v.id("daytona_snapshot") },
  handler: async (ctx, args) => {
    requireAdmin(await getAuthUser(ctx));

    const target = await ctx.db.get(args.id);
    if (!target) {
      throw new Error("Snapshot not found");
    }
    if (target.status === "primary") {
      throw new Error(
        "Cannot delete a primary snapshot. Promote another snapshot of the same tier first.",
      );
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Internal: resolve the current primary golden snapshot for a size class.
 * Used by project creation to decide which base snapshot to boot sandboxes
 * from. `sizeClass` "small" returns the limited-country snapshot; "standard"
 * (default) returns the standard snapshot.
 */
export const getPrimarySnapshot = internalQuery({
  args: {
    sizeClass: v.optional(v.union(v.literal("small"), v.literal("standard"))),
  },
  handler: async (ctx, args) => {
    const wantClass = args.sizeClass ?? "standard";
    const primaries = await ctx.db
      .query("daytona_snapshot")
      .withIndex("by_status", (q) => q.eq("status", "primary"))
      .collect();
    return (
      primaries.find((row) => sizeClassOf(row.tier) === wantClass) ?? null
    );
  },
});
