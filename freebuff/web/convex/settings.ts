import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getAuthUser } from "./users";

export const getInternal = internalQuery({
  args: {
    key: v.string(),
    defaultValue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    return setting?.value ?? args.defaultValue ?? false;
  },
});

// Get a setting
export const get = query({
  args: {
    key: v.string(),
    defaultValue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    return setting?.value ?? args.defaultValue ?? false;
  },
});

// Update a setting
export const update = mutation({
  args: {
    key: v.string(),
    value: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: Admin access required");
    }

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("settings", {
        key: args.key,
        value: args.value,
      });
    }
  },
});
