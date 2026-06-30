import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  action,
  mutation,
} from "!/_generated/server";
import { internal } from "!/_generated/api";
import { getAuthUser } from "../../users";
import { getVerifiedAccessProject } from "../../project";
import { workflow } from "./workflow";
import type { WorkflowId } from "@convex-dev/workflow";
import { finalizeMessageStream } from "./agent_message_stream";

const agentAdPayloadValidator = v.object({
  provider: v.string(),
  adText: v.string(),
  title: v.string(),
  cta: v.string(),
  brandName: v.optional(v.string()),
  url: v.string(),
  favicon: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  clickUrl: v.string(),
  impUrl: v.string(),
  placementId: v.optional(v.string()),
  servedAt: v.number(),
});

// Create a new agent message
export const createAgentMessage = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    userMessage: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    images: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("agent_message", {
      thread_id: args.threadId,
      user_message: args.userMessage,
      session_id: args.sessionId,
      isStreaming: true,
      state: "Processing",
      state_message: undefined,
      deactivated: false, // Always set to false when creating a message
      ...(args.images && { images: args.images }),
    });

    return messageId;
  },
});

export const persistAgentAdMessage = mutation({
  args: {
    sourceMessageId: v.id("agent_message"),
    ad: agentAdPayloadValidator,
  },
  returns: v.object({
    created: v.boolean(),
    messageId: v.id("agent_message"),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const sourceMessage = await ctx.db.get(args.sourceMessageId);
    if (!sourceMessage) {
      throw new Error("Source message not found");
    }
    if (sourceMessage.ad_payload) {
      throw new Error("Cannot attach an ad to another ad message");
    }

    const thread = await ctx.db.get(sourceMessage.thread_id);
    if (!thread) {
      throw new Error("Thread not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      thread.project_id,
    );
    if (!project) {
      throw new Error("Project not found or access denied");
    }

    const requestedPlacementId = args.ad.placementId ?? "agent-chat-after-user";
    const existingAds = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_and_ad_source", (q) =>
        q
          .eq("thread_id", sourceMessage.thread_id)
          .eq("ad_source_message_id", args.sourceMessageId),
      )
      .filter((q) => q.neq(q.field("deactivated"), true))
      .collect();
    const existing = existingAds.find(
      (message) =>
        (message.ad_payload?.placementId ?? "agent-chat-after-user") ===
        requestedPlacementId,
    );

    if (existing) {
      return { created: false, messageId: existing._id };
    }

    const title = args.ad.title || args.ad.brandName || "Sponsored";
    const cta = args.ad.cta || "Learn more";
    const messageId = await ctx.db.insert("agent_message", {
      thread_id: sourceMessage.thread_id,
      session_id: sourceMessage.session_id,
      assistant_stream: [
        {
          type: "text",
          content: "Quick sponsor recommendation:",
        },
        {
          type: "ad",
          title,
          content: args.ad.adText,
          description: `${cta} · ${args.ad.url}`,
        },
      ],
      ad_source_message_id: args.sourceMessageId,
      ad_payload: args.ad,
      isStreaming: false,
      state: "Completed",
      deactivated: false,
    });

    return { created: true, messageId };
  },
});

// Get agent message by ID
export const getAgentMessage = internalQuery({
  args: {
    messageId: v.id("agent_message"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

// Update message streaming state
export const updateAgentMessageStreaming = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      isStreaming: args.isStreaming,
    });
  },
});

// Update message state
export const updateAgentMessageState = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    state: v.union(
      v.literal("Processing"),
      v.literal("Completed"),
      v.literal("Paused"),
      v.literal("Cancelled"),
      v.literal("Error"),
    ),
    stateMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Reaching a terminal state finalizes the message: coalesce any live deltas
    // / inline stream into the immutable body and clear the inline array so list
    // reads stay light. (Codex/Claude/Gemini stream inline; this is where their
    // content is moved off the doc.)
    if (args.state !== "Processing") {
      await finalizeMessageStream(ctx, args.messageId, {
        messagePatch: {
          state: args.state,
          state_message: args.stateMessage,
          isStreaming: false,
        },
      });
      return;
    }

    await ctx.db.patch(args.messageId, {
      state: args.state,
      state_message: args.stateMessage,
      isStreaming: true,
    });
  },
});

// Update assistant stream
// Uses replace strategy to avoid conflicts - caller should send the complete array
export const updateAgentMessageStream = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    assistantStream: v.optional(
      v.array(
        v.object({
          type: v.string(),
          title: v.optional(v.string()),
          status: v.optional(v.string()),
          content: v.string(),
          description: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    // Use replace strategy - the caller sends the complete array
    // This avoids conflicts from concurrent updates by always replacing with the latest complete state
    await ctx.db.patch(args.messageId, {
      assistant_stream: args.assistantStream,
    });
  },
});

// Update checkpoint and commit hash
export const updateAgentMessageCheckpoint = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    checkpointId: v.optional(v.string()),
    commitHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      checkpoint_id: args.checkpointId,
      commit_hash: args.commitHash,
    });
  },
});

// Update usage and cost
export const updateAgentMessageUsage = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    totalCostUsd: v.optional(v.number()),
    usageBreakdown: v.optional(
      v.object({
        input_tokens: v.number(),
        cache_creation_input_tokens: v.number(),
        cache_read_input_tokens: v.number(),
        output_tokens: v.number(),
        other: v.optional(v.string()),
      }),
    ),
    modelUsed: v.optional(v.string()),
    creditsDeducted: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      total_cost_usd: args.totalCostUsd,
      usage_breakdown: args.usageBreakdown,
      model_used: args.modelUsed,
      ...(args.creditsDeducted !== undefined && {
        credits_deducted: args.creditsDeducted,
      }),
    });
  },
});

// Record the model id used for a message (display only; does not touch usage)
export const updateAgentMessageModel = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    modelUsed: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      model_used: args.modelUsed,
    });
  },
});

// Update credits deducted after credit tracking
export const updateAgentMessageCreditsDeducted = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    creditsDeducted: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      credits_deducted: args.creditsDeducted,
    });
  },
});

// Update session ID on message
export const updateAgentMessageSessionId = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      session_id: args.sessionId,
    });
  },
});

// Deactivate message (for rollbacks)
export const deactivateAgentMessage = internalMutation({
  args: {
    messageId: v.id("agent_message"),
  },
  handler: async (ctx, args) => {
    // Finalize so any in-flight deltas are coalesced/cleaned up rather than
    // orphaned when a streaming message is rolled back.
    await finalizeMessageStream(ctx, args.messageId, {
      messagePatch: {
        deactivated: true,
        state: "Cancelled",
        isStreaming: false,
      },
    });
  },
});

// Deactivate agent message and all messages after it in the thread
export const deactivateAgentMessageAndAfter = action({
  args: {
    messageId: v.id("agent_message"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(
      internal.coding_agent.cli_agent.agent_message.getAgentMessage,
      {
        messageId: args.messageId,
      },
    );

    if (!message) {
      throw new Error("Message not found");
    }

    // Get thread to find project
    const thread = await ctx.runQuery(
      internal.coding_agent.cli_agent.agent_thread.getAgentThread,
      {
        threadId: message.thread_id,
      },
    );

    if (!thread) {
      throw new Error("Thread not found");
    }

    // Terminate any active processing on the project
    await ctx.runMutation(internal.project.setStateTerminated, {
      projectId: thread.project_id,
    });

    // Use the message's creation time to deactivate all messages from this point onwards
    // Include the target message itself by using >= (messages at the same time or after)
    const targetCreationTime = message._creationTime;

    // First, collect all message IDs that need to be deactivated
    // We need to use a query that doesn't filter by deactivated to get all messages
    const allMessages = await ctx.runQuery(
      internal.coding_agent.cli_agent.queries.getAllAgentThreadMessages,
      {
        threadId: message.thread_id,
      },
    );

    // Filter to only messages that should be deactivated (from target time onwards, including the target message)
    // Also include the target message by ID to ensure it's always deactivated
    const messagesToDeactivate = allMessages.filter(
      (msg: any) =>
        (msg._creationTime >= targetCreationTime || msg._id === message._id) &&
        !msg.deactivated,
    );

    // Deactivate all messages in parallel
    await Promise.all(
      messagesToDeactivate.map((msg: any) =>
        ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.deactivateAgentMessage,
          {
            messageId: msg._id,
          },
        ),
      ),
    );

    return null;
  },
});

// Internal mutation to update message, thread, and project state after cancellation
export const cancelAgentMessageWorkflowInternal = internalMutation({
  args: {
    messageId: v.id("agent_message"),
    threadId: v.id("agent_thread"),
    projectId: v.id("project"),
    userMessage: v.optional(v.string()),
  },
  returns: v.object({
    userMessage: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Keep canceled messages visible in history; only stop streaming/processing
    // state. Finalize so any partial streamed content (live deltas or inline) is
    // coalesced into the body and still renders in history.
    await finalizeMessageStream(ctx, args.messageId, {
      messagePatch: {
        deactivated: false,
        state: "Cancelled",
        isStreaming: false,
      },
    });

    // Reset thread processing state and clear workflow ID
    await ctx.db.patch(args.threadId, {
      isProcessing: false,
      workflow_id: undefined,
      last_edited_timestamp: Date.now(),
    });

    // Reset project state if no other processing threads exist
    const processingThreads = await ctx.db
      .query("agent_thread")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .filter((q) => q.eq(q.field("isProcessing"), true))
      .collect();

    if (processingThreads.length === 0) {
      await ctx.db.patch(args.projectId, {
        state: "active",
      });
    }

    // Cancel should not re-insert the prompt into the input box.
    return {
      userMessage: undefined,
    };
  },
});

// Public action to cancel agent message workflow and mark the message as cancelled
// According to Convex workflow docs: https://www.convex.dev/components/workflow
// workflow.cancel() must be called from an action context
export const cancelAgentMessage = action({
  args: {
    messageId: v.id("agent_message"),
  },
  returns: v.object({
    userMessage: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ userMessage?: string | undefined }> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Get the message to verify access
    const message = await ctx.runQuery(
      internal.coding_agent.cli_agent.agent_message.getAgentMessage,
      {
        messageId: args.messageId,
      },
    );

    if (!message) {
      throw new Error("Message not found");
    }

    // Get the thread to verify access and get workflow ID
    const thread = await ctx.runQuery(
      internal.coding_agent.cli_agent.agent_thread.getAgentThread,
      {
        threadId: message.thread_id,
      },
    );

    if (!thread) {
      throw new Error("Thread not found");
    }

    // Verify user has access to the project
    const project = await ctx.runQuery(
      internal.project.getVerifiedAccessProjectInternal,
      {
        userId: user._id,
        projectId: thread.project_id,
      },
    );

    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Only allow cancellation if message is currently streaming
    if (!message.isStreaming) {
      throw new Error("Message is not currently streaming");
    }

    // Cancel the workflow using WorkflowManager (must be called from action context)
    // Reference: https://www.convex.dev/components/workflow
    if (thread.workflow_id) {
      try {
        // Cast string to WorkflowId (branded type) - workflow_id is stored as string in DB
        await workflow.cancel(ctx, thread.workflow_id as unknown as WorkflowId);
      } catch (error) {
        // If workflow cancellation fails, log but continue with state cleanup
        // The workflow might have already completed or been cancelled
        console.error(
          `Failed to cancel workflow ${thread.workflow_id}:`,
          error,
        );
      }
    }

    // For Freebuff threads the real work runs in a scheduled Node action that
    // the workflow.cancel above can't stop. Mark the run cancelled (the
    // running action polls this and aborts itself cooperatively) and the
    // mutation also calls scheduler.cancel for runs that haven't started yet.
    // session_id holds the Freebuff runId.
    if (thread.agent_type === 'Freebuff' && message.session_id) {
      try {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.freebuff_agent_run_mutations
            .cancelFreebuffAgentRunByRunId,
          { runId: message.session_id },
        )
      } catch (error) {
        console.error('Failed to cancel Freebuff run:', error)
      }
    }

    // Update message, thread, and project state
    // This handles the state cleanup regardless of whether workflow.cancel succeeded
    // Pass data we already have to avoid redundant queries
    return await ctx.runMutation(
      internal.coding_agent.cli_agent.agent_message
        .cancelAgentMessageWorkflowInternal,
      {
        messageId: args.messageId,
        threadId: message.thread_id,
        projectId: thread.project_id,
        userMessage: message.user_message,
      },
    );
  },
});

// One-time (self-scheduling) backfill: move the inline assistant_stream of
// existing finalized messages into the agent_message_body table and clear the
// inline array, so listAgentThreadMessages reads become light for historical
// messages too. New messages are already written this way at finalization.
// Skips in-flight (streaming) and ad messages (ads keep their small inline copy,
// which the UI reads directly). Safe to re-run: already-migrated messages have
// no inline content and are skipped. Invoke once after deploy, e.g.
//   npx convex run coding_agent/cli_agent/agent_message:backfillAgentMessageBodies '{"cursor":null}'
export const backfillAgentMessageBodies = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
    autoContinue: v.optional(v.boolean()),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.string(),
    migrated: v.number(),
  }),
  handler: async (ctx, args) => {
    const numItems = args.numItems ?? 50;
    const page = await ctx.db.query("agent_message").paginate({
      cursor: args.cursor,
      numItems,
    });

    let migrated = 0;
    for (const msg of page.page) {
      if (
        msg.isStreaming ||
        msg.ad_payload ||
        !msg.assistant_stream ||
        msg.assistant_stream.length === 0
      ) {
        continue;
      }
      await finalizeMessageStream(ctx, msg._id);
      migrated += 1;
    }

    if (args.autoContinue && !page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.cli_agent.agent_message.backfillAgentMessageBodies,
        {
          cursor: page.continueCursor,
          numItems,
          autoContinue: true,
        },
      );
    }

    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      migrated,
    };
  },
});

// Get messages by thread
export const getAgentMessagesByThread = internalQuery({
  args: {
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_message")
      .withIndex("by_thread", (q) => q.eq("thread_id", args.threadId))
      .filter((q) => q.neq(q.field("deactivated"), true))
      .order("asc")
      .collect();
  },
});
