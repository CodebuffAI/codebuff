import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";

const self: any = (internal as any).daytona_migration.backfill;

export type LegacyBackfillPage = {
  projectIds: Array<Doc<"project">["_id"]>;
  scanned: number;
  cursor: string | null;
  isDone: boolean;
};

export const readLegacyProjectsPage = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LegacyBackfillPage> => {
    const pageSize = Math.min(Math.max(args.pageSize ?? 200, 1), 500);
    const result = await ctx.db
      .query("daytona_migration")
      .withIndex("by_daytona_server", (q) => q.eq("daytona_server", "legacy"))
      .paginate({
        numItems: pageSize,
        cursor: args.cursor ?? null,
      });

    const projectIds = result.page.map((migration) => migration.project_id);

    return {
      projectIds,
      scanned: result.page.length,
      cursor: result.continueCursor ?? null,
      isDone: result.isDone,
    };
  },
});

export const markProjectsAsNewServer = internalMutation({
  args: {
    projectIds: v.array(v.id("project")),
  },
  handler: async (ctx, args): Promise<{ updated: number }> => {
    let updated = 0;
    for (const projectId of args.projectIds) {
      const migration = await ctx.db
        .query("daytona_migration")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
        .unique();
      if (!migration || migration.daytona_server !== "legacy") {
        continue;
      }

      await ctx.db.patch(migration._id, {
        daytona_server: "new",
        updated_at: Date.now(),
      });
      updated += 1;
    }

    return { updated };
  },
});

type ProjectPage = {
  projectIds: Array<Doc<"project">["_id"]>;
  scanned: number;
  cursor: string | null;
  isDone: boolean;
};

export const readProjectsPage = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProjectPage> => {
    const pageSize = Math.min(Math.max(args.pageSize ?? 200, 1), 500);
    const result = await ctx.db
      .query("project")
      .order("desc")
      .paginate({
        numItems: pageSize,
        cursor: args.cursor ?? null,
      });

    return {
      projectIds: result.page.map((project) => project._id),
      scanned: result.page.length,
      cursor: result.continueCursor ?? null,
      isDone: result.isDone,
    };
  },
});

export const upsertProjectsAsLegacyServer = internalMutation({
  args: {
    projectIds: v.array(v.id("project")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ inserted: number; updated: number; skippedNew: number }> => {
    let inserted = 0;
    let updated = 0;
    let skippedNew = 0;

    for (const projectId of args.projectIds) {
      const existing = await ctx.db
        .query("daytona_migration")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
        .unique();

      if (existing?.daytona_server === "new") {
        skippedNew += 1;
        continue;
      }

      if (!existing) {
        await ctx.db.insert("daytona_migration", {
          project_id: projectId,
          daytona_server: "legacy",
          migration_status: "idle",
          updated_at: Date.now(),
        });
        inserted += 1;
        continue;
      }

      if (existing.daytona_server !== "legacy") {
        await ctx.db.patch(existing._id, {
          daytona_server: "legacy",
          updated_at: Date.now(),
        });
        updated += 1;
      }
    }

    return { inserted, updated, skippedNew };
  },
});

export const runSeedAllProjectsAsLegacy = internalAction({
  args: {
    cursor: v.optional(v.string()),
    scanned: v.optional(v.number()),
    inserted: v.optional(v.number()),
    updated: v.optional(v.number()),
    skippedNew: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        status: "scheduled_next_batch";
        scanned: number;
        inserted: number;
        updated: number;
        skippedNew: number;
      }
    | {
        status: "completed";
        scanned: number;
        inserted: number;
        updated: number;
        skippedNew: number;
        dryRun: boolean;
      }
  > => {
    const totalScanned = args.scanned ?? 0;
    const totalInserted = args.inserted ?? 0;
    const totalUpdated = args.updated ?? 0;
    const totalSkippedNew = args.skippedNew ?? 0;

    const page: ProjectPage = await ctx.runQuery(self.readProjectsPage, {
      cursor: args.cursor,
      pageSize: args.pageSize,
    });

    let batchInserted = 0;
    let batchUpdated = 0;
    let batchSkippedNew = 0;

    if (!args.dryRun && page.projectIds.length > 0) {
      const result = await ctx.runMutation(self.upsertProjectsAsLegacyServer, {
        projectIds: page.projectIds,
      });
      batchInserted = result.inserted;
      batchUpdated = result.updated;
      batchSkippedNew = result.skippedNew;
    }

    const nextScanned = totalScanned + page.scanned;
    const nextInserted = totalInserted + batchInserted;
    const nextUpdated = totalUpdated + batchUpdated;
    const nextSkippedNew = totalSkippedNew + batchSkippedNew;

    console.log(
      `[DaytonaMigration][SeedLegacy] scanned=${nextScanned} inserted=${nextInserted} updated=${nextUpdated} skippedNew=${nextSkippedNew} done=${page.isDone} dryRun=${args.dryRun === true}`,
    );

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, self.runSeedAllProjectsAsLegacy, {
        cursor: page.cursor ?? undefined,
        scanned: nextScanned,
        inserted: nextInserted,
        updated: nextUpdated,
        skippedNew: nextSkippedNew,
        pageSize: args.pageSize,
        dryRun: args.dryRun,
      });

      return {
        status: "scheduled_next_batch",
        scanned: nextScanned,
        inserted: nextInserted,
        updated: nextUpdated,
        skippedNew: nextSkippedNew,
      };
    }

    return {
      status: "completed",
      scanned: nextScanned,
      inserted: nextInserted,
      updated: nextUpdated,
      skippedNew: nextSkippedNew,
      dryRun: args.dryRun === true,
    };
  },
});

export const startSeedAllProjectsAsLegacy = internalAction({
  args: {
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "started"; pageSize: number; dryRun: boolean }> => {
    await ctx.scheduler.runAfter(0, self.runSeedAllProjectsAsLegacy, {
      pageSize: args.pageSize,
      dryRun: args.dryRun,
    });

    return {
      status: "started",
      pageSize: args.pageSize ?? 200,
      dryRun: args.dryRun === true,
    };
  },
});
