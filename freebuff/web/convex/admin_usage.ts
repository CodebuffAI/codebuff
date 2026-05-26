import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getAuthUser } from "./users";

/**
 * Approximate per-user agent activity for internal admin views.
 * Convex does not expose per-user DB bandwidth or action GB-hours; agentInvocations
 * is a practical proxy for "heavy" users (correlates with primaryAgenticCycle runs).
 */
export const bumpUserAgentInvocation = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_platform_usage_stats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        agentInvocations: existing.agentInvocations + 1,
        lastInvocationAt: now,
      });
    } else {
      await ctx.db.insert("user_platform_usage_stats", {
        userId: args.userId,
        agentInvocations: 1,
        lastInvocationAt: now,
      });
    }
  },
});

export const getUsageLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      return [];
    }
    const lim = Math.min(Math.max(1, args.limit ?? 50), 200);
    const rows = await ctx.db.query("user_platform_usage_stats").collect();
    const sorted = rows
      .sort((a, b) => b.agentInvocations - a.agentInvocations)
      .slice(0, lim);
    const out: Array<{
      userId: Id<"users">;
      email: string;
      name: string;
      agentInvocations: number;
      lastInvocationAt: number;
    }> = [];
    for (const row of sorted) {
      const u = await ctx.db.get(row.userId);
      out.push({
        userId: row.userId,
        email: u?.email ?? "(unknown)",
        name: u?.name ?? "(unknown)",
        agentInvocations: row.agentInvocations,
        lastInvocationAt: row.lastInvocationAt,
      });
    }
    return out;
  },
});
