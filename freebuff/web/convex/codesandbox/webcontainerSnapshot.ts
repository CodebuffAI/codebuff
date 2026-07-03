import { v } from "convex/values";

import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery, query } from "../_generated/server";

/**
 * Persists (upserts) the storage id of the latest exported WebContainer
 * filesystem snapshot for a project. Only one snapshot is kept per project —
 * the previous blob is deleted best-effort to avoid unbounded storage growth.
 */
export const saveSnapshotRecord = internalMutation({
  args: {
    projectId: v.id("project"),
    storageId: v.id("_storage"),
    sizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("project_snapshots")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      const previousStorageId =
        existing.storageId !== args.storageId ? existing.storageId : null;
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        sizeBytes: args.sizeBytes,
      });
      // Delete old blob only after successfully updating the pointer.
      if (previousStorageId) {
        await ctx.storage.delete(previousStorageId).catch(() => {});
      }
    } else {
      await ctx.db.insert("project_snapshots", {
        projectId: args.projectId,
        storageId: args.storageId,
        sizeBytes: args.sizeBytes,
      });
    }
  },
});

export const getSnapshotRecordForProject = internalQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("project_snapshots")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

/**
 * Client-facing query used on project load to fetch a download URL for the
 * last exported filesystem snapshot, so the WebContainer can be restored
 * instead of re-mounting the blank template.
 */
export const getLatestSnapshotUrl = query({
  args: { semanticIdentifier: v.string() },
  returns: v.union(
    v.object({ url: v.string(), sizeBytes: v.optional(v.number()) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) return null;

    const record = await ctx.db
      .query("project_snapshots")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .first();
    if (!record) return null;

    const url = await ctx.storage.getUrl(record.storageId);
    if (!url) return null;

    return { url, sizeBytes: record.sizeBytes };
  },
});
