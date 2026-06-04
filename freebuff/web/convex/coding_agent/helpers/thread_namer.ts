"use node";

import { internal } from "!/_generated/api";
import { internalAction } from "!/_generated/server";
import { MODELS } from "!/utils/registry";
import { generateText } from "ai";
import { v } from "convex/values";

export const nameThread = internalAction({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;

    const thread = await ctx.runQuery(internal.thread.getThread, {
      threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }
    // if the thread already has a title, don't do anything
    if (!!thread.title) {
      return;
    }

    const firstMessage = await ctx.runQuery(
      internal.thread.getFirstMessageInThread,
      {
        threadId,
        projectId: thread?.project,
      },
    );

    if (!firstMessage) {
      throw new Error("First message not found");
    }

    if (firstMessage.role !== "user") {
      throw new Error("First message is not a user message");
    }

    const firstMessageContent = firstMessage.content;

    const result = await generateText({
      model: MODELS.PROJECT_NAME_GENERATOR_MODEL,
      prompt: `The user is creating a new thread and needs a brief and concise name for it that captures the thread's purpose. The name should be a single phrase.
    Here is the user's initial message: 
    "${firstMessageContent}"
    Immediately output only the name, and no other text. Your answer should be a single phrase.`,
      maxOutputTokens: 10,
    });

    await ctx.runMutation(internal.thread.setThreadTitle, {
      threadId,
      title: result.text,
    });
  },
});
