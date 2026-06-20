import { v } from "convex/values";

import {
  readAgentThreadCounter,
  readAuthCounter,
} from "./admin_platform_metrics";
import { internalMutation, query } from "./_generated/server";
import { getAuthUser } from "./users";

const AGENT_TYPES = [
  "Freebuff",
  "Codex",
  "Claude Code",
  "Gemini CLI",
] as const;

function utcDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function utcDaysInRange(startTs: number, endTs: number): string[] {
  const days: string[] = [];
  const cursor = new Date(startTs);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = utcDayKey(endTs);
  while (utcDayKey(cursor.getTime()) <= endDay) {
    days.push(utcDayKey(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * O(1) increment on each user prompt send. Scheduled from the send mutation so
 * metrics failures never block a message.
 */
export const recordAgentPrompt = internalMutation({
  args: {
    agentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const day = utcDayKey(Date.now());
    const existing = await ctx.db
      .query("agent_prompt_daily_stats")
      .withIndex("by_day_agent", (q) =>
        q.eq("day", day).eq("agent_type", args.agentType),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        prompt_count: existing.prompt_count + 1,
      });
    } else {
      await ctx.db.insert("agent_prompt_daily_stats", {
        day,
        agent_type: args.agentType,
        prompt_count: 1,
      });
    }
    return null;
  },
});

/**
 * Admin-only metrics. All reads are indexed / bounded — no full-table scans on
 * page load.
 *
 * - Auth + thread inventory: incremental stats counters (O(1) read), bumped when
 *   users connect/disconnect credentials or create threads
 * - Total users: aggregate count (O(log n))
 * - Prompts by agent: sum of agent_prompt_daily_stats rows for days in range
 * - Freebuff completed runs: sum freebuff_daily_usage rows per day in range
 * - Model invocations: small model_usage_stats table
 */
export const getAgentAuthAndSessionStats = query({
  args: {
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await getAuthUser(ctx);
    if (!admin || (admin.role !== "god" && admin.role !== "admin")) {
      return null;
    }

    const endTs = parseTimestamp(args.endTime) ?? Date.now();
    const startTs =
      parseTimestamp(args.startTime) ?? endTs - 24 * 60 * 60 * 1000;
    const days = utcDaysInRange(startTs, endTs);

    let totalUsers = 0;
    try {
      const aggregates = await import("./aggregates/admin_aggregates");
      totalUsers = await aggregates.allUsers.count(ctx, { bounds: {} });
    } catch {
      const usersStat = await ctx.db
        .query("stats")
        .withIndex("by_name", (q) => q.eq("name", "users"))
        .unique();
      totalUsers = usersStat?.value ?? 0;
    }

    const authCounters = {
      chatgptSubscriptionConnected: await readAuthCounter(
        ctx,
        "chatgptSubscriptionConnected",
      ),
      codexOpenAiByok: await readAuthCounter(ctx, "codexOpenAiByok"),
      claudeAnthropicByok: await readAuthCounter(ctx, "claudeAnthropicByok"),
      claudeBedrockByok: await readAuthCounter(ctx, "claudeBedrockByok"),
      gptPreferredOAuth: await readAuthCounter(ctx, "gptPreferredOAuth"),
      gptPreferredByok: await readAuthCounter(ctx, "gptPreferredByok"),
    };

    const threadsByAgentType: Record<string, number> = {};
    for (const agentType of AGENT_TYPES) {
      threadsByAgentType[agentType] = await readAgentThreadCounter(
        ctx,
        agentType,
      );
    }

    const userMessagesByAgentType: Record<string, number> = Object.fromEntries(
      AGENT_TYPES.map((type) => [type, 0]),
    );
    for (const day of days) {
      const rows = await ctx.db
        .query("agent_prompt_daily_stats")
        .withIndex("by_day", (q) => q.eq("day", day))
        .collect();
      for (const row of rows) {
        userMessagesByAgentType[row.agent_type] =
          (userMessagesByAgentType[row.agent_type] ?? 0) + row.prompt_count;
      }
    }

    let freebuffRunsCompleted = 0;
    let freebuffMeteredCredits = 0;
    for (const day of days) {
      const rows = await ctx.db
        .query("freebuff_daily_usage")
        .withIndex("by_day_metered_credits", (q) => q.eq("day", day))
        .collect();
      for (const row of rows) {
        freebuffRunsCompleted += row.run_count;
        freebuffMeteredCredits += row.metered_credits;
      }
    }

    const modelRows = await ctx.db.query("model_usage_stats").collect();
    const modelInvocationsByAgentType: Record<string, number> = {};
    const modelInvocationsTodayByAgentType: Record<string, number> = {};
    const todayStr = utcDayKey(Date.now());
    for (const row of modelRows) {
      modelInvocationsByAgentType[row.agentType] =
        (modelInvocationsByAgentType[row.agentType] ?? 0) + row.total;
      if (row.recentDayDate === todayStr) {
        modelInvocationsTodayByAgentType[row.agentType] =
          (modelInvocationsTodayByAgentType[row.agentType] ?? 0) +
          row.recentDay;
      }
    }

    const promptsTrackedIncrementally = Object.values(
      userMessagesByAgentType,
    ).some((count) => count > 0);

    const authTrackedIncrementally = Object.values(authCounters).some(
      (count) => count > 0,
    );

    const threadsTrackedIncrementally = Object.values(threadsByAgentType).some(
      (count) => count > 0,
    );

    return {
      timeRange: {
        startTime: new Date(startTs).toISOString(),
        endTime: new Date(endTs).toISOString(),
        days: days.length,
      },
      auth: {
        totalUsers,
        ...authCounters,
        authTrackedIncrementally,
      },
      threadsByAgentType,
      threadsTrackedIncrementally,
      sessionsInRange: {
        userMessagesByAgentType,
        /** Completed Freebuff runs (from freebuff_daily_usage, all history). */
        freebuffRunsCompleted,
        freebuffMeteredCredits,
        promptsTrackedIncrementally,
      },
      modelInvocationsByAgentType,
      modelInvocationsTodayByAgentType,
    };
  },
});
