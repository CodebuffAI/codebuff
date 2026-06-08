import {
  internalAction,
  internalMutation,
  mutation,
} from "!/_generated/server";
import { createNewThread } from "!/thread";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { agentModeValidator } from "../utils/registry_validators";
import { contextLengthValidator } from "./config/contextLengthPresets";
import { runTriggerGates } from "./shared/triggerGates";
import type { AgentMode } from "../utils/registry_validators";

const FRONTEND_AGENT_MODES = [
  "POWERFUL",
  "EFFICIENT",
  "PRECISE",
  "CHEAP",
  "STANDARD",
  "OPUS",
  "PLANNING",
  // Legacy aliases kept valid so old stored values continue to work.
  "EXPENSIVE",
  "ULTRA_CHEAP",
] as const;

function normalizeAgentMode(agentMode?: AgentMode): AgentMode {
  switch (agentMode) {
    case "EXPENSIVE":
      return "POWERFUL";
    case "ULTRA_CHEAP":
      return "CHEAP";
    case "MINIMAX":
      return "STANDARD";
    default:
      return agentMode ?? "POWERFUL";
  }
}

function truncateForMessageInsert(
  value: string,
  maxBytes: number,
  fieldName: string,
) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }

  console.warn(
    `[Trigger] Truncating ${fieldName} before insert: ${(bytes.length / 1024).toFixed(1)} KB -> ${(maxBytes / 1024).toFixed(1)} KB`,
  );

  const decoder = new TextDecoder();
  const headBytes = Math.floor(maxBytes * 0.8);
  const tailBytes = Math.floor(maxBytes * 0.2);
  return [
    decoder.decode(bytes.slice(0, headBytes)),
    `\n\n[${fieldName} truncated]\n\n`,
    decoder.decode(bytes.slice(-tailBytes)),
  ].join("");
}

// saves the user message and starts the workflow
export const saveMessageAndStartWorkflow = mutation({
  args: {
    projectSemanticIdentifier: v.optional(v.string()),
    message: v.string(),
    displayMessage: v.optional(v.string()),
    agentMode: v.optional(agentModeValidator), // Optional agent mode selection
    contextLength: v.optional(contextLengthValidator), // Optional context length preset (small, medium, long)
    projectId: v.optional(v.id("project")),
    images: v.optional(v.array(v.id("_storage"))),
    tempPageContext: v.optional(v.string()), // Current page URL for temporary injection

    // THIS IS NOT SECURE
    _skipRateLimitCheck: v.optional(v.boolean()), // Internal use only - skip rate limiting for internal calls
  },
  returns: v.union(
    v.object({ success: v.literal(true) }),
    v.object({
      success: v.literal(false),
      error: v.object({
        kind: v.string(),
        retryAfter: v.optional(v.number()),
        message: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    void ctx;
    void args;

    // Legacy chats are retired and read-only. The UI no longer renders an input
    // for these threads; this is the server-side enforcement so the deprecated
    // agent can never be invoked, even via a direct/stale client call.
    return {
      success: false as const,
      error: {
        kind: "LEGACY_AGENT_DISABLED",
        message:
          "This chat uses the retired legacy agent and is now read-only. Start a new thread on the Freebuff agent to continue.",
      },
    };
  },
});

// Internal action to create checkpoint, update message, then start agent cycle
export const createCheckpointThenStartCycle = internalAction({
  args: {
    projectId: v.id("project"),
    messageId: v.id("messages"),
    message: v.string(),
    agentMode: v.optional(agentModeValidator),
    contextLength: v.optional(contextLengthValidator),
    executingUserIsPlatformAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    console.log(
      `[Checkpoint] Starting checkpoint creation for message ${args.messageId}`,
    );
    try {
      // Create checkpoint using the centralized API
      console.log(
        `[Checkpoint] Calling createCheckpoint with projectId: ${args.projectId}, message: "${args.message}"`,
      );
      const checkpointResult = await ctx.runAction(
        internal.versioning.checkpoint.createCheckpoint,
        {
          projectId: args.projectId,
          message: args.message,
          messageId: args.messageId,
        },
      );
      console.log(`[Checkpoint] createCheckpoint returned:`, checkpointResult);

      // Update the message with the checkpoint hash if successful
      if (checkpointResult.success && checkpointResult.checkpointId) {
        await ctx.runMutation(
          internal.coding_agent.trigger.updateMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: checkpointResult.checkpointId,
          },
        );
        console.log(
          `[Checkpoint] Updated message ${args.messageId} with checkpoint ${checkpointResult.checkpointId}`,
        );
      } else if (checkpointResult.error) {
        // Check if it's a retry scenario
        if (checkpointResult.error.includes("retrying")) {
          console.log(
            `[Checkpoint] Checkpoint creation is being retried for message ${args.messageId}`,
          );
          // Keep the "creating" state during retries
          // The retry will update the state when it succeeds or ultimately fails
        } else {
          console.error(
            `[Checkpoint] Failed to create checkpoint: ${checkpointResult.error}`,
          );
          console.log(
            `[Checkpoint] Setting message ${args.messageId} to failed state`,
          );
          // Set failed state only for permanent failures
          await ctx.runMutation(
            internal.coding_agent.trigger.updateMessageCheckpoint,
            {
              messageId: args.messageId,
              checkpointId: "failed",
            },
          );
          console.log(
            `[Checkpoint] Message ${args.messageId} set to failed state`,
          );
        }
      } else {
        console.error(
          "[Checkpoint] Unexpected result from createCheckpoint:",
          checkpointResult,
        );
        console.log(
          `[Checkpoint] Setting message ${args.messageId} to failed state due to unexpected result`,
        );
        // Set failed state for unexpected results
        await ctx.runMutation(
          internal.coding_agent.trigger.updateMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: "failed",
          },
        );
        console.log(
          `[Checkpoint] Message ${args.messageId} set to failed state`,
        );
      }
    } catch (error) {
      console.error(
        "[Checkpoint] Exception during checkpoint creation:",
        error,
      );
      console.error(
        "[Checkpoint] Error stack:",
        error instanceof Error ? error.stack : "No stack trace",
      );
      // Set failed state if there's an exception
      try {
        console.log(
          `[Checkpoint] Setting message ${args.messageId} to failed state due to exception`,
        );
        await ctx.runMutation(
          internal.coding_agent.trigger.updateMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: "failed",
          },
        );
        console.log(
          `[Checkpoint] Message ${args.messageId} set to failed state after exception`,
        );
      } catch (updateError) {
        console.error(
          "[Checkpoint] Failed to set error state after exception:",
          updateError,
        );
      }
    }

    // Start agent cycle AFTER checkpoint is created (or failed)
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      console.error(`[Checkpoint] Project not found: ${args.projectId}`);
      return;
    }

    console.log(`[Checkpoint] Starting agent cycle after checkpoint creation`);
    await ctx.scheduler.runAfter(
      0,
      internal.coding_agent.cycle.primaryAgenticCycle,
      {
        project: project,
        agentMode: args.agentMode,
        contextLength: args.contextLength,
        cycleCount: 0,
        executingUserIsPlatformAdmin: args.executingUserIsPlatformAdmin,
      },
    );
  },
});

// Internal mutation to update message with checkpoint ID
export const updateMessageCheckpoint = internalMutation({
  args: {
    messageId: v.id("messages"),
    checkpointId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      commit_hash: args.checkpointId,
    });
  },
});

// TODO: FIX THIS
export const internal_saveMessageAndStartWorkflow = internalMutation({
  args: {
    message: v.string(),
    displayMessage: v.optional(v.string()),
    agentMode: v.optional(agentModeValidator),
    contextLength: v.optional(contextLengthValidator),
    projectId: v.id("project"),
    images: v.optional(v.array(v.id("_storage"))),
    tempPageContext: v.optional(v.string()), // Current page URL for temporary injection
    executingUserIsPlatformAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    let threadId = project.active_thread;
    let isFirstMessage = false;

    if (!threadId) {
      // create new thread
      threadId = await createNewThread(ctx, project._id);
      isFirstMessage = true;
    } else {
      // Check if this is the first message in an existing thread
      const existingMessages = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) =>
          q.eq("thread_id", threadId).eq("streaming", false),
        )
        .first();
      isFirstMessage = !existingMessages;
    }

    // Create a checkpoint before processing (except for the first message)
    // We'll schedule this immediately after inserting the message
    const shouldCreateCheckpoint = !isFirstMessage;
    const normalizedAgentMode = normalizeAgentMode(args.agentMode);
    const storedMessage = truncateForMessageInsert(
      args.message,
      220 * 1024,
      "message",
    );
    const storedDisplayMessage = args.displayMessage
      ? truncateForMessageInsert(
          args.displayMessage,
          40 * 1024,
          "display message",
        )
      : undefined;
    const storedPageContext = args.tempPageContext
      ? truncateForMessageInsert(args.tempPageContext, 8 * 1024, "page context")
      : undefined;

    // insert user message with a temporary checkpoint indicator for non-first messages
    const userMessageId = await ctx.db.insert("messages", {
      project_id: project._id,
      role: "user",
      content: storedMessage,
      ...(storedDisplayMessage && { core_message: storedDisplayMessage }),
      date: Date.now(),
      selected_entry_point_ids: [],
      thread_id: threadId,
      streaming: false,
      deactivated: false,
      ...(args.images && { images: args.images }),
      ...(storedPageContext && { pageContext: storedPageContext }),
      // Set temporary commit hash for non-first messages to enable undo button
      ...(shouldCreateCheckpoint && { commit_hash: "creating" }),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.coding_agent.helpers.fastReturn.saveFastReturnPreview,
      {
        messageId: userMessageId,
        message: storedDisplayMessage ?? storedMessage,
      },
    );

    // Create checkpoint and start agent cycle
    // For non-first messages, checkpoint must be created BEFORE agent can modify files
    // For first messages, start agent cycle immediately
    if (shouldCreateCheckpoint) {
      await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.trigger.createCheckpointThenStartCycle,
        {
          projectId: project._id,
          messageId: userMessageId,
          message: `Before: ${storedMessage.slice(0, 100)}${storedMessage.length > 100 ? "..." : ""}`,
          agentMode: normalizedAgentMode,
          contextLength: args.contextLength,
          executingUserIsPlatformAdmin: args.executingUserIsPlatformAdmin,
        },
      );
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.cycle.primaryAgenticCycle,
        {
          project: project,
          agentMode: normalizedAgentMode,
          contextLength: args.contextLength,
          cycleCount: 0,
          executingUserIsPlatformAdmin: args.executingUserIsPlatformAdmin,
        },
      );
    }

    console.log("[JulyAgent] Started cycle");

    await ctx.db.patch(project._id, {
      terminated: false,
      state: "processing",
    });

    if (project.active_thread) {
      console.log("[JulyAgent] Scheduling thread namer");
      await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.helpers.thread_namer.nameThread,
        {
          threadId: project.active_thread,
        },
      );
    } else {
      console.log("[JulyAgent] No active thread found");
    }

    console.log("[JulyAgent] Updated project state to processing");
  },
});
