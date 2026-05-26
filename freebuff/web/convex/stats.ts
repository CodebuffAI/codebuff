import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get a specific stat value by name
 */
export const getStat = query({
  args: { name: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const stat = await ctx.db
      .query("stats")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    return stat?.value ?? 0;
  },
});

/**
 * Get multiple stats by names
 */
export const getStats = query({
  args: { names: v.array(v.string()) },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, args) => {
    const stats: Record<string, number> = {};

    for (const name of args.names) {
      const stat = await ctx.db
        .query("stats")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique();

      stats[name] = stat?.value ?? 0;
    }

    return stats;
  },
});

/**
 * Get user count (replaces the old inefficient getUserCount)
 */
export const getUserCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const stat = await ctx.db
      .query("stats")
      .withIndex("by_name", (q) => q.eq("name", "users"))
      .unique();

    return stat?.value ?? 0;
  },
});

/**
 * Get project count (replaces the old inefficient getProjectCount)
 */
export const getProjectCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const stat = await ctx.db
      .query("stats")
      .withIndex("by_name", (q) => q.eq("name", "projects"))
      .unique();

    return stat?.value ?? 0;
  },
});

/**
 * Internal function to increment a stat by a given amount
 */
export const incrementStat = internalMutation({
  args: {
    name: v.string(),
    amount: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const incrementAmount = args.amount ?? 1;

    // Try to find existing stat
    const existingStat = await ctx.db
      .query("stats")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existingStat) {
      // Update existing stat
      const newValue = existingStat.value + incrementAmount;
      await ctx.db.patch(existingStat._id, { value: newValue });
      return newValue;
    } else {
      // Create new stat
      const newValue = incrementAmount;
      await ctx.db.insert("stats", {
        name: args.name,
        value: newValue,
      });
      return newValue;
    }
  },
});

/**
 * Helper function to increment a stat directly from a mutation context
 */
export async function incrementStatDirectly(
  ctx: { db: any },
  name: string,
  amount: number = 1,
): Promise<number> {
  // Try to find existing stat
  const existingStat = await ctx.db
    .query("stats")
    .withIndex("by_name", (q: any) => q.eq("name", name))
    .unique();

  if (existingStat) {
    // Update existing stat
    const newValue = existingStat.value + amount;
    await ctx.db.patch(existingStat._id, { value: newValue });
    return newValue;
  } else {
    // Create new stat
    const newValue = amount;
    await ctx.db.insert("stats", {
      name,
      value: newValue,
    });
    return newValue;
  }
}

/**
 * Internal function to decrement a stat by a given amount
 */
export const decrementStat = internalMutation({
  args: {
    name: v.string(),
    amount: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const decrementAmount = args.amount ?? 1;

    // Try to find existing stat
    const existingStat = await ctx.db
      .query("stats")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existingStat) {
      // Update existing stat (don't go below 0)
      const newValue = Math.max(0, existingStat.value - decrementAmount);
      await ctx.db.patch(existingStat._id, { value: newValue });
      return newValue;
    } else {
      // Create new stat with value 0 (since we're decrementing)
      await ctx.db.insert("stats", {
        name: args.name,
        value: 0,
      });
      return 0;
    }
  },
});

/**
 * Internal function to set a stat to a specific value
 */
export const setStat = internalMutation({
  args: {
    name: v.string(),
    value: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Try to find existing stat
    const existingStat = await ctx.db
      .query("stats")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existingStat) {
      // Update existing stat
      await ctx.db.patch(existingStat._id, { value: args.value });
      return args.value;
    } else {
      // Create new stat
      await ctx.db.insert("stats", {
        name: args.name,
        value: args.value,
      });
      return args.value;
    }
  },
});
