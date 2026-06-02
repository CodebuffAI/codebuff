import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { PAUSE_REASON_VALIDATOR } from "./constants";
import { pausedUsersByActive } from "./aggregates/admin_aggregates";

/**
 * Create a new pause record (mutation)
 */
export const createPauseRecord = internalMutation({
  args: {
    userId: v.id("users"),
    pauseReason: PAUSE_REASON_VALIDATOR,
    autoUnpauseEnabled: v.boolean(),
    pausedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const pauseId = await ctx.db.insert("paused_users", {
      userId: args.userId,
      pauseReason: args.pauseReason,
      pausedAt: Date.now(),
      pausedBy: args.pausedBy,
      autoUnpauseEnabled: args.autoUnpauseEnabled,
      active: true,
    });

    // Update aggregates for new paused user
    const newPausedUser = await ctx.db.get(pauseId);
    if (newPausedUser) {
      await pausedUsersByActive.insert(ctx, newPausedUser);
    }
  },
});

/**
 * Update an existing pause record (mutation)
 */
export const updatePauseRecord = internalMutation({
  args: {
    pauseId: v.id("paused_users"),
    pauseReason: PAUSE_REASON_VALIDATOR,
    autoUnpauseEnabled: v.boolean(),
    pausedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get the old record before updating
    const oldRecord = await ctx.db.get(args.pauseId);

    await ctx.db.patch(args.pauseId, {
      pauseReason: args.pauseReason,
      pausedAt: Date.now(),
      pausedBy: args.pausedBy,
      autoUnpauseEnabled: args.autoUnpauseEnabled,
      active: true,
    });

    // Update aggregates if active status changed
    const newRecord = await ctx.db.get(args.pauseId);
    if (oldRecord && newRecord) {
      await pausedUsersByActive.replace(ctx, oldRecord, newRecord);
    }
  },
});

/**
 * Deactivate a pause record (mutation)
 */
export const deactivatePauseRecord = internalMutation({
  args: {
    pauseId: v.id("paused_users"),
  },
  handler: async (ctx, args) => {
    // Get the old record before deactivating
    const oldRecord = await ctx.db.get(args.pauseId);

    await ctx.db.patch(args.pauseId, {
      active: false,
      unpausedAt: Date.now(),
    });

    // Update aggregates since active status changed
    const newRecord = await ctx.db.get(args.pauseId);
    if (oldRecord && newRecord) {
      await pausedUsersByActive.replace(ctx, oldRecord, newRecord);
    }
  },
});
