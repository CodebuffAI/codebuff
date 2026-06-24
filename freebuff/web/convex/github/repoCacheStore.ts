import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";

const installationValidator = v.object({
  installation_id: v.number(),
  account_login: v.string(),
  account_type: v.optional(v.string()),
  contents_permission: v.optional(v.string()),
  can_write: v.boolean(),
  manage_url: v.string(),
});

const repoValidator = v.object({
  name: v.string(),
  full_name: v.string(),
  owner: v.string(),
  private: v.boolean(),
  description: v.union(v.string(), v.null()),
  html_url: v.string(),
  default_branch: v.string(),
  permission_push: v.boolean(),
  installation_id: v.number(),
  pushed_at: v.union(v.string(), v.null()),
});

/**
 * Instant (DB-only) read of the user's cached connectable repos. The connect
 * dialog subscribes to this so it renders immediately on open without hitting
 * GitHub. Returns null when nothing has been cached yet.
 */
export const getCachedConnectableRepositories = query({
  args: {},
  returns: v.union(
    v.object({
      installations: v.array(installationValidator),
      repos: v.array(repoValidator),
      updated_at: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;
    const cache = await ctx.db
      .query("github_repo_cache")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (!cache) return null;
    return {
      installations: cache.installations,
      repos: cache.repos,
      updated_at: cache.updated_at,
    };
  },
});

/**
 * Upsert the user's repo cache. Called by the refresh action after fetching
 * from GitHub. One doc per user keeps writes cheap and the dialog reactive.
 */
export const setRepoCache = internalMutation({
  args: {
    userId: v.id("users"),
    installations: v.array(installationValidator),
    repos: v.array(repoValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("github_repo_cache")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();
    const data = {
      user_id: args.userId,
      installations: args.installations,
      repos: args.repos,
      updated_at: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("github_repo_cache", data);
    }
    return null;
  },
});
