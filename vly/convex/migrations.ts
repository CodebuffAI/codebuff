import {
  internalAction,
  internalQuery,
  internalMutation,
  action,
} from "!/_generated/server.js";
import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { getRootDomain } from "../lib/utils.js";
import { components, internal } from "./_generated/api.js";
import { DataModel } from "./_generated/dataModel.js";
import {
  allUsers,
  usersByRole,
  usersByTier,
  usersByDay,
  allProjects,
  projectsByDay,
  allConvexInstances,
  pausedProjectsByActive,
  pausedUsersByActive,
} from "./aggregates/admin_aggregates.js";

export const migrations = new Migrations<DataModel>(components.migrations);

export const setStreamingState = migrations.define({
  table: "messages",
  migrateOne: async (ctx, doc) => {
    if (doc.streaming === undefined) {
      await ctx.db.patch(doc._id, { streaming: false });
    }
  },
});

// Old migration - replaced with custom implementation below due to 16MB document limit
// export const setDeactivatedDefault = migrations.define({
//   table: "messages",
//   batchSize: 100,
//   migrateOne: async (ctx, doc) => {
//     if (doc.deactivated === undefined) {
//       await ctx.db.patch(doc._id, { deactivated: false });
//     }
//   },
// });

// Custom migration to handle large messages without hitting 16MB read limit
export const setDeactivatedDefaultCustom = internalAction({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    errors: v.number(),
    isDone: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      // Use pagination to process messages in batches
      const result: {
        messageIds: Array<any>;
        isDone: boolean;
        nextCursor: string | null;
      } = await ctx.runQuery(internal.migrations.getMessagesForMigration, {
        cursor: args.cursor,
        batchSize,
      });

      for (const msgId of result.messageIds) {
        try {
          await ctx.runMutation(internal.migrations.updateMessageDeactivated, {
            messageId: msgId,
          });
          updatedCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(`${msgId}: ${error.message}`);
          console.error(`Failed to update message ${msgId}:`, error);
        }
        processedCount++;
      }

      console.log(
        `Processed ${processedCount} messages, updated ${updatedCount}, errors ${errorCount}`,
      );
      if (errors.length > 0) {
        console.log("Errors:", errors.slice(0, 10)); // Log first 10 errors
      }

      return {
        processed: processedCount,
        updated: updatedCount,
        errors: errorCount,
        isDone: result.isDone,
        nextCursor: result.nextCursor,
      };
    } catch (error: any) {
      console.error("Migration batch failed:", error);
      throw error;
    }
  },
});

// Query to get message IDs that need migration (only reads _id and deactivated)
export const getMessagesForMigration = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("messages")
      .paginate(
        args.cursor
          ? ({ numItems: args.batchSize, cursor: args.cursor } as any)
          : { numItems: args.batchSize },
      );

    // Filter to only get messages where deactivated is undefined
    const messageIds = result.page
      .filter((msg) => msg.deactivated === undefined)
      .map((msg) => msg._id);

    return {
      messageIds,
      isDone: result.isDone,
      nextCursor: result.continueCursor,
    };
  },
});

// Mutation to update a single message (minimal read/write)
export const updateMessageDeactivated = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    // Only patch the field, don't read the full document
    await ctx.db.patch(args.messageId, { deactivated: false });
  },
});

// Runner to process all messages to completion
export const runDeactivatedMigrationComplete = internalAction({
  args: {},
  returns: v.object({
    totalProcessed: v.number(),
    totalUpdated: v.number(),
    totalErrors: v.number(),
  }),
  handler: async (ctx) => {
    let cursor: string | null = null;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    console.log("🚀 Starting deactivated field migration...");

    while (true) {
      const result: {
        processed: number;
        updated: number;
        errors: number;
        isDone: boolean;
        nextCursor: string | null;
      } = await ctx.runAction(internal.migrations.setDeactivatedDefaultCustom, {
        cursor: cursor,
        batchSize: 100,
      });

      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalErrors += result.errors;

      console.log(
        `📊 Progress: ${totalProcessed} processed, ${totalUpdated} updated, ${totalErrors} errors`,
      );

      if (result.isDone) {
        console.log("✅ Migration complete!");
        break;
      }

      cursor = result.nextCursor ?? null;
    }

    return {
      totalProcessed,
      totalUpdated,
      totalErrors,
    };
  },
});

/**
 * The convex project creation logic incorrectly used to incorrectly set the
 * prodDeploymentName to the devDeploymentName. This migration sets it to null.
 * The prodDeploymentName should be filled in when the deployment is created (this
 * happens when the user deploys the project for the first time).
 */
export const setProdDeploymentNameToNull = migrations.define({
  table: "project_convex_instance",
  migrateOne: async (ctx, doc) => {
    await ctx.db.patch(doc._id, {
      prodDeploymentName: null,
    });
  },
});

export const migrateDeployKeys = internalAction({
  args: {
    project: v.object({
      _id: v.id("project"),
      _creationTime: v.string(),
      semantic_identifier: v.string(),
      sandbox_id: v.string(),
      convex_url: v.optional(v.string()),
    }),
    skipSave: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await fetch(`${process.env.MIGRATION_SERVER_URL}/migrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args.project),
    });

    if (args.skipSave) {
      return;
    }

    const body = await result.json();

    // If migration server didn't return valid Convex data, skip saving
    // VLY Convex is already created at project assignment time in create.ts
    if (!body.convexProjectId || !body.devDeploymentName) {
      console.log(
        "[migrateDeployKeys] No existing Convex data found, skipping (VLY Convex already created in create.ts):",
        args.project._id,
      );
      return;
    }

    await ctx.runMutation(internal.convex_instance.save, {
      projectId: args.project._id,
      convexProjectId: body.convexProjectId,
      devDeploymentName: body.devDeploymentName,
      prodDeploymentName: body.prodDeploymentName,
      upsert: true,
    });

    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.project._id,
    });

    if (project && project.state !== "processing") {
      await ctx.runMutation(
        internal.coding_agent.trigger.internal_saveMessageAndStartWorkflow,
        {
          projectId: args.project._id,
          message: "Please run the typecheck and fix any errors if present.",
          agentMode: "POWERFUL",
        },
      );
    }
  },
});

export const migrateDeployKeysPublic = action({
  args: {
    project: v.object({
      _id: v.id("project"),
      _creationTime: v.string(),
      semantic_identifier: v.string(),
      sandbox_id: v.string(),
      convex_url: v.optional(v.string()),
    }),
    skipSave: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bridge: call the internal function
    await ctx.runAction(internal.migrations.migrateDeployKeys, args);
    return null;
  },
});

export const setRootDomains = migrations.define({
  table: "domain",
  migrateOne: async (ctx, doc) => {
    await ctx.db.patch(doc._id, {
      rootDomain: getRootDomain(doc.domain),
    });
  },
});

export const setWildcardVerified = migrations.define({
  table: "domain",
  migrateOne: async (ctx, doc) => {
    const rootDomain = getRootDomain(doc.domain);
    const matchingRootDomainRecords = await ctx.db
      .query("domain")
      .withIndex("by_rootDomain", (q) => q.eq("rootDomain", rootDomain))
      .collect();
    if (matchingRootDomainRecords.some((d) => d.wildcard_cert_generated)) {
      await ctx.db.patch(doc._id, {
        wildcard_cert_generated: true,
      });
    }
  },
});

// Refresh unified search_text for integrations so search indexes reindex consistently
export const refreshIntegrationSearchText = migrations.define({
  table: "integration",
  migrateOne: async (ctx, doc) => {
    const tags: Array<string> = Array.isArray((doc as any).tags)
      ? ((doc as any).tags as Array<string>)
      : [];
    const title: string = (doc as any).title ?? "";
    const description: string = (doc as any).description ?? "";
    const computed = `${title} ${description} ${tags.join(" ")}`.toLowerCase();
    if ((doc as any).search_text !== computed) {
      await ctx.db.patch(doc._id, { search_text: computed });
    }
  },
});

export const lowercaseDomains = migrations.define({
  table: "domain",
  migrateOne: async (ctx, doc) => {
    await ctx.db.patch(doc._id, {
      domain: doc.domain.toLowerCase(),
    });
  },
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Backfill referred_user_email snapshots so referral spin dedupe survives
// account deletion/re-creation for legacy rows.
export const backfillReferralSpinEmails = migrations.define({
  table: "referral_spins",
  batchSize: 200,
  migrateOne: async (ctx, doc) => {
    if (doc.source !== "referral" || doc.referred_user_email !== undefined) {
      return;
    }

    if (!doc.referred_user_id) {
      return;
    }

    const referredUser = await ctx.db.get(doc.referred_user_id);
    if (!referredUser) {
      return;
    }

    await ctx.db.patch(doc._id, {
      referred_user_email: normalizeEmail(referredUser.email),
    });
  },
});

export const runIntegrations = migrations.runner(
  internal.migrations.refreshIntegrationSearchText,
);

export const runReferralSpinEmailBackfill = migrations.runner(
  internal.migrations.backfillReferralSpinEmails,
);

// Backfill migration for users aggregate
export const backfillUsersAggregate = migrations.define({
  table: "users",
  batchSize: 100,
  migrateOne: async (ctx, doc) => {
    // Insert each user document into the aggregates
    // The aggregates will automatically index by:
    // - allUsers (no partitioning)
    // - usersByRole (by role)
    // - usersByTier (by tier)
    // - usersByDay (by creation day)

    // Wrap in try-catch to handle duplicate key errors from concurrent migration workers
    try {
      await allUsers.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }

    try {
      await usersByRole.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }

    try {
      await usersByTier.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }

    try {
      await usersByDay.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }
  },
});

// Backfill migration for projects aggregate
export const backfillProjectsAggregate = migrations.define({
  table: "project",
  batchSize: 100,
  migrateOne: async (ctx, doc) => {
    // Wrap in try-catch to handle duplicate key errors from concurrent migration workers
    try {
      await allProjects.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }

    try {
      await projectsByDay.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }
  },
});

// Backfill migration for convex instances aggregate
export const backfillConvexInstancesAggregate = migrations.define({
  table: "project_convex_instance",
  batchSize: 100,
  migrateOne: async (ctx, doc) => {
    // Wrap in try-catch to handle duplicate key errors from concurrent migration workers
    try {
      await allConvexInstances.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }
  },
});

// Backfill migration for paused projects aggregate
export const backfillPausedProjectsAggregate = migrations.define({
  table: "paused_projects",
  batchSize: 100,
  migrateOne: async (ctx, doc) => {
    // Wrap in try-catch to handle duplicate key errors from concurrent migration workers
    try {
      await pausedProjectsByActive.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }
  },
});

// Backfill migration for paused users aggregate
export const backfillPausedUsersAggregate = migrations.define({
  table: "paused_users",
  batchSize: 100,
  migrateOne: async (ctx, doc) => {
    // Wrap in try-catch to handle duplicate key errors from concurrent migration workers
    try {
      await pausedUsersByActive.insert(ctx, doc);
    } catch (error: any) {
      if (!error?.message?.includes("already exists")) throw error;
    }
  },
});

// Clear all aggregate data structures (for resetting corrupt/stale data)
export const clearAllAggregates = internalAction({
  args: {},
  handler: async (ctx) => {
    // Clear each aggregate to remove any corrupt/stale data
    await ctx.runMutation(
      internal.aggregates.admin_aggregates.clearAllAggregates,
      {},
    );

    console.log("✅ All aggregates cleared successfully");
    return { success: true };
  },
});

// Run all backfill migrations in sequence (one batch at a time - for manual control)
export const backfillAllAggregatesManual = migrations.runner([
  internal.migrations.backfillUsersAggregate,
  internal.migrations.backfillProjectsAggregate,
  internal.migrations.backfillConvexInstancesAggregate,
  internal.migrations.backfillPausedProjectsAggregate,
  internal.migrations.backfillPausedUsersAggregate,
]);

// Run all backfill migrations to completion automatically
export const backfillAllAggregates = internalAction({
  args: {
    clearFirst: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const migrationRefs = [
      internal.migrations.backfillUsersAggregate,
      internal.migrations.backfillProjectsAggregate,
      internal.migrations.backfillConvexInstancesAggregate,
      internal.migrations.backfillPausedProjectsAggregate,
      internal.migrations.backfillPausedUsersAggregate,
    ];

    if (args.clearFirst) {
      console.log("🗑️  Clearing all aggregates first...");
      await ctx.runAction(internal.migrations.clearAllAggregates, {});

      console.log("🚀 Starting backfill from beginning (cursor: null)...");
      // Run each migration to completion with cursor: null to force restart
      for (const migrationRef of migrationRefs) {
        let cursor: string | null = null;

        while (true) {
          const result = await migrations.runOne(ctx, migrationRef, { cursor });

          if (result.isDone) {
            console.log(
              `  ✅ Completed migration, processed ${result.processed} records`,
            );
            break;
          }

          cursor = result.cursor ?? null;
        }
      }
    } else {
      console.log("🚀 Resuming backfill from saved cursor state...");

      // Loop runSerially until all migrations complete
      while (true) {
        const result = await migrations.runSerially(ctx, migrationRefs);

        if (!result) {
          throw new Error(
            "runSerially returned undefined - no migrations provided?",
          );
        }

        if (result.isDone) {
          console.log("  ✅ All migrations in series complete");
          break;
        }

        console.log(
          `  📊 Processed ${result.processed || 0} records, continuing...`,
        );
      }
    }

    console.log("✅ All aggregates backfilled successfully!");
    return { success: true };
  },
});

// Old runner - replaced with runDeactivatedMigrationComplete
// export const runDeactivatedMigration = migrations.runner(
//   internal.migrations.setDeactivatedDefault,
// );

export const run = migrations.runner();
