import { internalMutation, mutation, query } from "!/_generated/server";
import { v } from "convex/values";

export const logBuildError = internalMutation({
  args: {
    projectId: v.id("project"),
    error: v.string(),
    build_log: v.string(),
  },
  handler: async (ctx, args) => {
    const { projectId, error, build_log } = args;
    const date = Date.now();
    await ctx.db.insert("build_error", {
      projectId,
      error,
      build_log,
      date,
      status: "unresolved",
    });
  },
});

export const getUnresolvedBuildErrors = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const { projectId } = args;
    // Use compound index for better performance - no in-memory filtering needed
    const errors = await ctx.db
      .query("build_error")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", projectId).eq("status", "unresolved"),
      )
      .collect();

    // Also get errors with undefined status for backward compatibility
    const legacyErrors = await ctx.db
      .query("build_error")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", projectId).eq("status", undefined),
      )
      .filter((q) => q.eq(q.field("resolved"), undefined))
      .collect();

    return [...errors, ...legacyErrors];
  },
});

export const deleteBuildError = mutation({
  args: {
    errorId: v.id("build_error"),
  },
  handler: async (ctx, { errorId }) => {
    await ctx.db.delete(errorId);
  },
});

export const resolveBuildErrors = mutation({
  args: {
    errorIds: v.array(v.id("build_error")),
  },
  handler: async (ctx, { errorIds }) => {
    for (const id of errorIds) {
      await ctx.db.patch(id, {
        resolved: true,
        status: "resolved",
      });
    }
  },
});

export const dismissBuildErrors = mutation({
  args: {
    errorIds: v.array(v.id("build_error")),
  },
  handler: async (ctx, { errorIds }) => {
    for (const id of errorIds) {
      await ctx.db.patch(id, {
        resolved: true,
        status: "dismissed",
      });
    }
  },
});

export const invalidateAllBuildErrors = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unresolvedErrors = await ctx.db
      .query("build_error")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "unresolved"),
          q.and(
            q.eq(q.field("status"), undefined),
            q.eq(q.field("resolved"), undefined),
          ),
        ),
      )
      .collect();

    for (const error of unresolvedErrors) {
      await ctx.db.patch(error._id, {
        resolved: true,
        status: "invalidated",
      });
    }

    console.log(
      `[BuildErrors] Invalidated ${unresolvedErrors.length} build errors for project ${args.projectId}`,
    );
  },
});
