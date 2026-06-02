import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUser } from "./users";

export const bumpUserAgentInvocation = internalMutation({
  args: {
    userId: v.id("users"),
    source: v.optional(v.union(v.literal("v2"), v.literal("cli"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("user_platform_usage_stats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    const src = args.source ?? "v2";
    if (existing) {
      await ctx.db.patch(existing._id, {
        agentInvocations: existing.agentInvocations + 1,
        lastInvocationAt: now,
        ...(src === "v2" && { v2Runs: (existing.v2Runs ?? 0) + 1 }),
        ...(src === "cli" && { cliRuns: (existing.cliRuns ?? 0) + 1 }),
      });
    } else {
      await ctx.db.insert("user_platform_usage_stats", {
        userId: args.userId,
        agentInvocations: 1,
        lastInvocationAt: now,
        v2Runs: src === "v2" ? 1 : 0,
        cliRuns: src === "cli" ? 1 : 0,
      });
    }
  },
});

export const getAdminUsageData = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) return null;

    const top10 = await ctx.db
      .query("user_platform_usage_stats")
      .withIndex("by_invocations")
      .order("desc")
      .take(10);

    const users = [];
    for (const stat of top10) {
      const u = await ctx.db.get(stat.userId);
      users.push({
        userId: stat.userId as string,
        email: u?.email ?? "(unknown)",
        name: u?.name ?? "(unknown)",
        v2Runs: stat.v2Runs ?? 0,
        cliRuns: stat.cliRuns ?? 0,
        totalRuns: stat.agentInvocations,
        lastRunAt: stat.lastInvocationAt,
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const modelRows = await ctx.db.query("model_usage_stats").collect();
    const models = modelRows.map((s) => ({
      agentType: s.agentType,
      model: s.model,
      total: s.total,
      recent: s.recentDayDate === todayStr ? s.recentDay : 0,
    }));

    return { users, models };
  },
});
