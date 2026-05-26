import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const insertSearchLog = internalMutation({
  args: {
    userId: v.id("users"),
    projectId: v.id("project"),
    query: v.string(),
    response: v.string(),
    model: v.string(),
    citations: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.userId) {
      const log = await ctx.db.insert("search_logs", {
        projectId: args.projectId,
        userId: args.userId,
        date: Date.now(),
        query: args.query,
        response: args.response,
        model: args.model,
        citations: args.citations,
      });
      const logDoc = await ctx.db.get(log);
      return logDoc as Doc<"search_logs">;
    }
    return undefined;
  },
});
