import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUser } from "./users";

const DIST_REFRESH_WINDOW_MS = 10 * 60 * 1000;

export const enqueueRefreshIfEligible = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return false;
    }

    if (!project.sandbox_id?.startsWith("daytona:")) {
      return false;
    }

    const lastDistBuildAt = project.last_dist_build_at ?? 0;
    const isEligible = Date.now() - lastDistBuildAt > DIST_REFRESH_WINDOW_MS;
    if (!isEligible) {
      return false;
    }

    await ctx.scheduler.runAfter(
      0,
      internal.fallback_dist_publish.publishFallbackDist,
      {
        projectId: args.projectId,
      },
    );

    return true;
  },
});

export const triggerFallbackDistPublish = mutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (
      !membership &&
      user.role !== "god"
    ) {
      throw new Error(
        "Unauthorized: You do not have permission to publish fallback dist",
      );
    }

    if (!project.sandbox_id?.startsWith("daytona:")) {
      throw new Error("Fallback dist publish is only supported for Daytona projects");
    }

    await ctx.scheduler.runAfter(
      0,
      internal.fallback_dist_publish.publishFallbackDist,
      {
        projectId: args.projectId,
        force: true,
      },
    );

    return null;
  },
});
