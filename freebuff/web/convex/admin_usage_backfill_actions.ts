"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const self = (internal as any).admin_usage_backfill_actions;
const helpers = (internal as any).admin_usage_backfill;

// Incremental scan model: each backfill persists its pagination cursor
// (admin_backfill_state) after every page, and a refresh resumes from the
// stored cursor — so only rows created since the last refresh are read.
// The old behavior re-scanned the entire messages / agent_message tables
// (full docs, including large message bodies) on every admin refresh click,
// which dominated database bandwidth. A full rebuild (runBackfill with
// full: true) clears the cursors and stats and rescans from the beginning.

export const backfillCli = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    processed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const processed = args.processed ?? 0;
    // First invocation of a refresh resumes from the persisted cursor.
    let cursor = args.cursor;
    if (cursor === undefined) {
      const state = await ctx.runQuery(helpers.getBackfillCursor, {
        key: "cli",
      });
      cursor = state?.cursor ?? null;
    }
    const page: any = await ctx.runQuery(helpers._readCliPage, {
      cursor: cursor ?? undefined,
    });

    if (page.items.length === 0 && page.isDone) {
      await ctx.runMutation(helpers.setBackfillCursor, {
        key: "cli",
        cursor: page.cursor,
      });
      console.log(`[Backfill CLI] Done. Total processed: ${processed}`);
      return;
    }

    const threadIds = [...new Set(page.items.map((i: any) => i.threadId))];
    const threadInfo: Record<string, { agentType: string; projectId: string }> =
      await ctx.runQuery(helpers._getThreadInfo, { threadIds });

    const projectIds = [
      ...new Set(Object.values(threadInfo).map((t) => t.projectId)),
    ];
    const ownerMap: Record<string, string> = await ctx.runQuery(
      helpers._getProjectOwnerMap,
      { projectIds },
    );

    const userCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};

    for (const item of page.items) {
      const info = threadInfo[item.threadId];
      if (!info) continue;
      const ownerId = ownerMap[info.projectId];
      if (ownerId) {
        userCounts[ownerId] = (userCounts[ownerId] ?? 0) + 1;
      }
      const model = item.model || info.agentType;
      const modelKey = `${info.agentType}::${model}`;
      modelCounts[modelKey] = (modelCounts[modelKey] ?? 0) + 1;
    }

    const userEntries = Object.entries(userCounts).map(([userId, count]) => ({
      userId: userId as any,
      v2: 0,
      cli: count,
    }));
    if (userEntries.length > 0) {
      await ctx.runMutation(helpers._upsertUserStats, {
        entries: userEntries,
      });
    }

    const modelEntries = Object.entries(modelCounts).map(([key, count]) => ({
      agentType: key.slice(0, key.indexOf("::")),
      model: key.slice(key.indexOf("::") + 2),
      count,
    }));
    if (modelEntries.length > 0) {
      await ctx.runMutation(helpers._upsertModelStats, {
        entries: modelEntries,
      });
    }

    // Persist progress so an interrupted backfill (or the next refresh)
    // resumes here instead of re-reading already-counted pages.
    await ctx.runMutation(helpers.setBackfillCursor, {
      key: "cli",
      cursor: page.cursor,
    });

    const newProcessed = processed + page.items.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, self.backfillCli, {
        cursor: page.cursor,
        processed: newProcessed,
      });
    } else {
      console.log(`[Backfill CLI] Done. Total: ${newProcessed}`);
    }
  },
});

export const backfillV2 = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    processed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const processed = args.processed ?? 0;
    let cursor = args.cursor;
    if (cursor === undefined) {
      const state = await ctx.runQuery(helpers.getBackfillCursor, {
        key: "v2",
      });
      cursor = state?.cursor ?? null;
    }
    const page: any = await ctx.runQuery(helpers._readV2Page, {
      cursor: cursor ?? undefined,
    });

    if (page.items.length === 0 && page.isDone) {
      await ctx.runMutation(helpers.setBackfillCursor, {
        key: "v2",
        cursor: page.cursor,
      });
      console.log(`[Backfill V2] Done. Total processed: ${processed}`);
      return;
    }

    const projectIds = [...new Set(page.items.map((i: any) => i.projectId))];
    const ownerMap: Record<string, string> = await ctx.runQuery(
      helpers._getProjectOwnerMap,
      { projectIds },
    );

    const userCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};

    for (const item of page.items) {
      const ownerId = ownerMap[item.projectId];
      if (ownerId) {
        userCounts[ownerId] = (userCounts[ownerId] ?? 0) + 1;
      }
      modelCounts[item.model] = (modelCounts[item.model] ?? 0) + 1;
    }

    const userEntries = Object.entries(userCounts).map(([userId, count]) => ({
      userId: userId as any,
      v2: count,
      cli: 0,
    }));
    if (userEntries.length > 0) {
      await ctx.runMutation(helpers._upsertUserStats, {
        entries: userEntries,
      });
    }

    const modelEntries = Object.entries(modelCounts).map(([model, count]) => ({
      agentType: "v2",
      model,
      count,
    }));
    if (modelEntries.length > 0) {
      await ctx.runMutation(helpers._upsertModelStats, {
        entries: modelEntries,
      });
    }

    await ctx.runMutation(helpers.setBackfillCursor, {
      key: "v2",
      cursor: page.cursor,
    });

    const newProcessed = processed + page.items.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, self.backfillV2, {
        cursor: page.cursor,
        processed: newProcessed,
      });
    } else {
      console.log(`[Backfill V2] Done. Total: ${newProcessed}`);
    }
  },
});

export const runBackfill = internalAction({
  args: { full: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    // No persisted cursors yet means the incremental model has never run, so
    // stats may already include the whole table from the old always-rescan
    // behavior — force a full rebuild once to avoid double counting.
    const cliState = await ctx.runQuery(helpers.getBackfillCursor, {
      key: "cli",
    });
    const v2State = await ctx.runQuery(helpers.getBackfillCursor, {
      key: "v2",
    });
    const full = args.full || cliState === null || v2State === null;
    if (full) {
      // Full rebuild: wipe stats and rescan both tables from the beginning.
      await ctx.runMutation(helpers.clearModelStats, {});
      await ctx.runMutation(helpers.setBackfillCursor, {
        key: "cli",
        cursor: null,
      });
      await ctx.runMutation(helpers.setBackfillCursor, {
        key: "v2",
        cursor: null,
      });
    }
    await ctx.scheduler.runAfter(0, self.backfillCli, {});
    await ctx.scheduler.runAfter(0, self.backfillV2, {});
  },
});
