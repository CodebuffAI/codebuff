import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const refinePrompt = mutation({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { content } = args;

    const stream = await ctx.db.insert("temporary_stream", {
      content: "",
      resolved: false,
    });

    // ctx.scheduler.runAfter(0, internal.ai.agentCalls.refinePromptWithStream, {
    //   streamId: stream,
    //   initialText: content,
    // });

    return stream;
  },
});

export const getStream = query({
  args: {
    streamId: v.id("temporary_stream"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.streamId);
  },
});
export const updateStream = internalMutation({
  args: {
    streamId: v.id("temporary_stream"),
    chunk: v.string(),
  },
  handler: async (ctx, args) => {
    const stream = await ctx.db.get(args.streamId);
    if (!stream) {
      throw new Error("Stream not found");
    }

    await ctx.db.patch(stream._id, {
      content: stream.content + args.chunk,
    });
  },
});

export const resolveStream = internalMutation({
  args: {
    streamId: v.id("temporary_stream"),
  },
  handler: async (ctx, args) => {
    const stream = await ctx.db.get(args.streamId);
    if (!stream) {
      throw new Error("Stream not found");
    }

    await ctx.db.patch(stream._id, {
      resolved: true,
    });
  },
});
