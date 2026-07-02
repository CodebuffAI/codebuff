import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUser } from "./users";

const backfillActions = (internal as any).admin_usage_backfill_actions;

export const clearModelStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("model_usage_stats").collect();
    for (const row of all) {
      await ctx.db.delete(row._id);
    }
  },
});

// Persisted backfill cursors ('cli' / 'v2') so a refresh only scans rows added
// since the previous run. A full rebuild (full: true) clears them and rescans.
// Returns null when no state exists yet (first run — caller should treat it
// as a full rebuild so counts aren't added on top of pre-existing stats).
export const getBackfillCursor = internalQuery({
  args: { key: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ cursor: string | null } | null> => {
    const state = await ctx.db
      .query("admin_backfill_state")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return state ? { cursor: state.cursor } : null;
  },
});

export const setBackfillCursor = internalMutation({
  args: { key: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("admin_backfill_state")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (state) {
      await ctx.db.patch(state._id, {
        cursor: args.cursor,
        updated_at: Date.now(),
      });
    } else {
      await ctx.db.insert("admin_backfill_state", {
        key: args.key,
        cursor: args.cursor,
        updated_at: Date.now(),
      });
    }
  },
});

export const refreshModelStats = mutation({
  args: { full: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }
    await ctx.scheduler.runAfter(0, backfillActions.runBackfill, {
      full: args.full ?? false,
    });
  },
});

// Matches wrapper.ts getSemanticModelName
function toSemanticName(raw: string): string {
  switch (raw) {
    case "GPT_5":
      return "OpenAI GPT 5";
    case "GPT_5_4":
      return "OpenAI GPT 5.4";
    case "GPT_5_4_MINI":
      return "OpenAI GPT 5.4 Mini";
    case "GPT_5_3_CODEX":
      return "OpenAI GPT 5.3 Codex";
    case "GPT_5_4_NANO":
      return "OpenAI GPT 5.4 Nano";
    case "GPT_5_MINI":
      return "OpenAI GPT 5 Mini";
    case "GPT_5_NANO":
      return "OpenAI GPT 5 Nano";
    case "GEMINI_3_PRO":
      return "Google Gemini 3.1 Pro";
    case "GEMINI_2_5_PRO":
      return "Google Gemini 2.5 Pro";
    case "GEMINI_2_5_FLASH":
      return "Google Gemini 2.5 Flash";
    case "GEMINI_2_5_FLASH_LITE":
      return "Google Gemini 2.5 Flash Lite";
    case "GEMINI_3_FLASH":
      return "Google Gemini 3 Flash";
    case "CLAUDE_4_SONNET":
      return "Anthropic Claude 4 Sonnet";
    case "CLAUDE_BEDROCK":
      return "Anthropic Claude 4.6 Sonnet";
    case "CLAUDE_3_7_BEDROCK":
      return "Anthropic Claude 3.7 Sonnet";
    case "CLAUDE_OPUS_BEDROCK":
      return "Anthropic Claude 4.6 Opus";
    case "CLAUDE_LOW_QOS":
      return "Anthropic Claude (Low QoS)";
    case "CLAUDE_ANTHROPIC":
      return "Anthropic Claude";
    case "CLAUDE_SONNET_GATEWAY":
      return "Anthropic Claude Sonnet";
    case "GROK_4_FAST":
      return "xAI Grok 4 Fast";
    case "O_3":
      return "OpenAI o3";
    case "QWEN_3":
      return "Qwen 3";
    case "QWEN_3_CODER_TURBO":
      return "Qwen 3 Coder Turbo";
    case "2.5-pro":
      return "Google Gemini 2.5 Pro";
    default:
      if (
        raw.includes(" ") ||
        raw.startsWith("Anthropic") ||
        raw.startsWith("Google") ||
        raw.startsWith("OpenAI")
      ) {
        return raw;
      }
      return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export const cleanupAndReNormalize = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("model_usage_stats").collect();
    let deleted = 0;
    let merged = 0;
    for (const row of all) {
      const normalized = toSemanticName(row.model);
      if (normalized === row.model) continue;

      const target = await ctx.db
        .query("model_usage_stats")
        .withIndex("by_agent_model", (q) =>
          q.eq("agentType", row.agentType).eq("model", normalized),
        )
        .unique();

      if (target && target._id !== row._id) {
        await ctx.db.patch(target._id, {
          total: target.total + row.total,
          recentDay: target.recentDay + row.recentDay,
        });
        await ctx.db.delete(row._id);
        merged++;
      } else {
        await ctx.db.patch(row._id, { model: normalized });
      }
      deleted++;
    }
    console.log(`[Cleanup] Normalized ${deleted} rows, merged ${merged}`);
  },
});

// --- Page readers (small pages to stay under 16MB) ---

export const _readCliPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("agent_message")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });
    const items: Array<{ threadId: string; model: string }> = [];
    for (const msg of result.page) {
      if (!msg.thread_id) continue;
      const rawModel = (msg.model_used as string) ?? "";
      items.push({
        threadId: msg.thread_id as string,
        model: rawModel ? toSemanticName(rawModel) : "",
      });
    }
    return {
      items,
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const _readV2Page = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("messages")
      .paginate({ numItems: 200, cursor: args.cursor ?? null });
    const items: Array<{ projectId: string; model: string }> = [];
    for (const msg of result.page) {
      if (msg.role !== "assistant") continue;
      if (!msg.project_id) continue;
      const rawModel =
        msg.model_semantic_name ||
        (msg.token_usage && msg.token_usage.length > 0
          ? msg.token_usage[0].model
          : null) ||
        "not recorded";
      const model = toSemanticName(String(rawModel));
      items.push({
        projectId: msg.project_id as string,
        model,
      });
    }
    return {
      items,
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const _getThreadInfo = internalQuery({
  args: { threadIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result: Record<string, { agentType: string; projectId: string }> = {};
    for (const id of args.threadIds) {
      // Point lookup by id. The previous .filter(_id == id) form was a full
      // table scan of agent_thread PER thread id.
      const normalized = ctx.db.normalizeId("agent_thread", id);
      const thread = normalized ? await ctx.db.get(normalized) : null;
      if (thread) {
        result[id] = {
          agentType: thread.agent_type,
          projectId: thread.project_id as string,
        };
      }
    }
    return result;
  },
});

export const _getProjectOwnerMap = internalQuery({
  args: { projectIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result: Record<string, string> = {};
    for (const pid of args.projectIds) {
      const member = await ctx.db
        .query("project_member")
        .withIndex("by_project", (q) => q.eq("project", pid as any))
        .filter((q) => q.eq(q.field("project_role"), "owner"))
        .first();
      if (member) {
        result[pid] = member.user as string;
      }
    }
    return result;
  },
});

// --- Upsert mutations ---

export const _upsertUserStats = internalMutation({
  args: {
    entries: v.array(
      v.object({
        userId: v.id("users"),
        v2: v.number(),
        cli: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("user_platform_usage_stats")
        .withIndex("by_user", (q) => q.eq("userId", entry.userId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          v2Runs: (existing.v2Runs ?? 0) + entry.v2,
          cliRuns: (existing.cliRuns ?? 0) + entry.cli,
        });
      } else {
        await ctx.db.insert("user_platform_usage_stats", {
          userId: entry.userId,
          agentInvocations: entry.v2 + entry.cli,
          lastInvocationAt: Date.now(),
          v2Runs: entry.v2,
          cliRuns: entry.cli,
        });
      }
    }
  },
});

export const _upsertModelStats = internalMutation({
  args: {
    entries: v.array(
      v.object({
        agentType: v.string(),
        model: v.string(),
        count: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("model_usage_stats")
        .withIndex("by_agent_model", (q) =>
          q.eq("agentType", entry.agentType).eq("model", entry.model),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          total: existing.total + entry.count,
        });
      } else {
        await ctx.db.insert("model_usage_stats", {
          agentType: entry.agentType,
          model: entry.model,
          total: entry.count,
          recentDay: 0,
          recentDayDate: todayStr,
        });
      }
    }
  },
});
