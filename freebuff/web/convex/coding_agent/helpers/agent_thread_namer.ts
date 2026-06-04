"use node";

import { internal } from "!/_generated/api";
import { internalAction } from "!/_generated/server";
import { MODELS } from "!/utils/registry";
import { generateText } from "ai";
import { v } from "convex/values";

export const nameAgentThread = internalAction({
  args: {
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;

    const thread = await ctx.runQuery(
      internal.coding_agent.cli_agent.agent_thread.getAgentThread,
      {
        threadId,
      },
    );

    if (!thread) {
      throw new Error("Thread not found");
    }
    // if the thread already has a title, don't do anything
    if (!!thread.title) {
      return;
    }

    // Get the first user message in the thread
    // Query messages directly from the database
    const messages = await ctx.runQuery(
      internal.coding_agent.cli_agent.queries.getAgentMessagesPaginated,
      {
        threadId,
        cursor: null,
        numItems: 10,
      },
    );

    const firstUserMessage = messages.page.find(
      (msg: any) => msg.user_message && msg.user_message.trim().length > 0,
    );

    if (!firstUserMessage || !firstUserMessage.user_message) {
      return; // No user message found, can't generate title
    }

    const firstMessageContent = firstUserMessage.user_message;

    const result = await generateText({
      model: MODELS.PROJECT_NAME_GENERATOR_MODEL,
      prompt: `The user is creating a new thread and needs a brief and concise name for it that captures the thread's purpose. The name should be a single phrase.
    Here is the user's initial message: 
    "${firstMessageContent}"
    Immediately output only the name, and no other text. Your answer should be a single phrase.`,
      maxOutputTokens: 10,
    });

    await ctx.runMutation(
      internal.coding_agent.cli_agent.agent_thread
        .updateAgentThreadTitleInternal,
      {
        threadId,
        title: result.text,
      },
    );
  },
});
