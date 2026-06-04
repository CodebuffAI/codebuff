import { internalMutation } from "./_generated/server";

import { v } from "convex/values";
// add new memory
export const addMemory = internalMutation({
  args: {
    projectId: v.id("project"),
    threadId: v.id("thread"),
    type: v.union(
      v.literal("error_solution"),
      v.literal("problem_solution"),
      v.literal("approved_component"),
      v.literal("unsolved_problem"),
    ),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("memory", {
      project: args.projectId,
      thread: args.threadId,
      type: args.type,
      content: args.content,
      date: Date.now(),
      status: "logged",
    });
  },
});
