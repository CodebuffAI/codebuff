import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUser } from "./users";

/**
 * Saves a screenshot R2 URL to a project
 *
 * Called after screenshot is uploaded to Cloudflare R2.
 * Resets the commit counter to 0.
 *
 * @param projectId - ID of the project
 * @param r2Url - Public URL of the screenshot in R2
 */
export const saveProjectScreenshot = mutation({
  args: {
    projectId: v.id("project"),
    r2Url: v.string(),
  },
  handler: async (ctx, args) => {
    // Authenticate user
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Validate project exists
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Check project membership (owner or admin can save screenshots)
    const membership = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (
      !membership ||
      (membership.project_role !== "owner" &&
        membership.project_role !== "member" &&
        membership.project_role !== "admin")
    ) {
      throw new Error(
        "Unauthorized: You do not have permission to edit this project",
      );
    }

    // Update project with new screenshot URL and reset commit counter
    await ctx.db.patch(args.projectId, {
      screenshot_r2_url: args.r2Url,
      commits_since_screenshot: 0,
    });

    console.log("[Screenshot] Saved R2 URL and reset commit counter", {
      projectId: args.projectId,
      r2Url: args.r2Url,
    });
  },
});

/**
 * Internal mutation to save screenshot from automated process
 * No authentication needed since it's internal
 */
export const saveProjectScreenshotInternal = internalMutation({
  args: {
    projectId: v.id("project"),
    r2Url: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Update project with new screenshot URL and reset commit counter
    await ctx.db.patch(args.projectId, {
      screenshot_r2_url: args.r2Url,
      commits_since_screenshot: 0,
    });

    console.log(
      "[Screenshot] Saved R2 URL and reset commit counter (internal)",
      {
        projectId: args.projectId,
        r2Url: args.r2Url,
      },
    );
  },
});

/**
 * Increments the commit counter for a project
 * Called by the agent after each commit
 */
export const incrementCommitCounter = internalMutation({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const currentCount = project.commits_since_screenshot ?? 0;
    const newCount = currentCount + 1;

    await ctx.db.patch(args.projectId, {
      commits_since_screenshot: newCount,
    });

    console.log("[Screenshot] Incremented commit counter", {
      projectId: args.projectId,
      count: newCount,
    });

    return newCount;
  },
});

/**
 * Checks if a screenshot should be updated for a project
 * Returns true if 10 or more commits have been made since last screenshot
 */
export const shouldUpdateScreenshot = query({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return false;

    // Check if 0 or more commits since last screenshot
    const commitCount = project.commits_since_screenshot ?? 0;
    return commitCount > 0;
  },
});
