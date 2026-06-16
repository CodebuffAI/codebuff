import { internalAction, mutation } from "!/_generated/server";
import { v } from "convex/values";
import { Id } from "!/_generated/dataModel";
import { internal } from "../../_generated/api";
import {
  createAgentThread,
  formatInitialUserMessageThreadTitle,
} from "./agent_thread";
import { runTriggerGates } from "../shared/triggerGates";

// Main entry point for the agent - saves message and schedules the agent run.
// We use Convex's built-in scheduler (no concurrency cap) instead of a workpool
// (capped queue) so a fourth concurrent user never waits behind three running
// turns. Hard crashes are caught by `sweepTimedOutFreebuffRuns` (every minute).
// History: this used to go through a durable workflow plus an intermediate
// `execute` Node action; those hops added scheduler round-trips and a second
// Node cold start (~7-14s total) before the agent could start.
export const saveMessageAndStartWorkflow = mutation({
  args: {
    projectSemanticIdentifier: v.optional(v.string()),
    message: v.string(),
    projectId: v.optional(v.id("project")),
    images: v.optional(v.array(v.id("_storage"))),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
    // Selected open-source Freebuff model id (only used for the Freebuff
    // agent). Persisted on the thread so the workflow picks the matching
    // bundled agent and follow-up messages keep the selection.
    freebuffModel: v.optional(v.string()),
    _skipRateLimitCheck: v.optional(v.boolean()), // Internal use only
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
    // Track partial writes so the catch block can roll them back. Without
    // this, a failure after "mark processing" leaves the thread permanently
    // stuck in a Processing state that blocks all future sends.
    let threadIdForCleanup: Id<"agent_thread"> | undefined;
    let messageIdForCleanup: Id<"agent_message"> | undefined;
    try {
      const normalizedAgentType = "Freebuff" as const;

      const gates = await runTriggerGates({
        ctx,
        message: args.message,
        projectSemanticIdentifier: args.projectSemanticIdentifier,
        projectId: args.projectId,
        skipRateLimitCheck: args._skipRateLimitCheck,
        agentType: normalizedAgentType,
        freebuffModel: args.freebuffModel,
      });

      if (!gates.ok) {
        return { success: false as const, error: gates.error };
      }

      const { user, project } = gates;

      // Engagement metrics: record this user as active. Scheduled so it runs
      // in its own transaction and can never break the send; the schedule is
      // rolled back automatically if this mutation throws.
      await ctx.scheduler.runAfter(0, internal.activity.recordActivity, {
        userId: user._id,
      });

      // Check if project is terminated due to an unresolved GitHub sync conflict.
      // If the terminated flag is stale, clear it and continue.
      if (project.terminated) {
        const hasUnresolvedConflicts = await ctx.runQuery(
          internal.github.sync.status.hasUnresolvedConflicts,
          {
            projectId: project._id,
          },
        );

        if (hasUnresolvedConflicts) {
          console.log("[CLIAgent] Project is terminated, blocking new message", {
            projectId: project._id,
          });
          return {
            success: false as const,
            error: {
              kind: "PROJECT_TERMINATED",
              message:
                "Project is terminated due to GitHub sync conflicts. Please resolve conflicts before continuing.",
            },
          };
        }

        await ctx.db.patch(project._id, {
          terminated: false,
        });
      }

      // Fail fast before creating any thread/message state: the agent runs
      // inside the project's Daytona sandbox.
      if (!project.sandbox_id || !project.sandbox_id.startsWith("daytona:")) {
        return {
          success: false as const,
          error: {
            kind: "NO_SANDBOX",
            message: "Project does not have a Daytona sandbox",
          },
        };
      }

      // Get or create agent thread
      let threadId: Id<"agent_thread"> | undefined =
        project.active_agent_thread;
      let isNewThread = false;

      if (!threadId) {
        // Create new thread (no active_session_id)
        threadId = await createAgentThread(ctx, project._id, normalizedAgentType);

        // Update project with active thread
        await ctx.db.patch(project._id, {
          active_agent_thread: threadId,
        });

        isNewThread = true;
      } else {
        // Get existing thread to check active_session_id
        const thread = await ctx.db.get(threadId);
        if (!thread) {
          console.error("[CLIAgent] Thread not found", { threadId });
          return {
            success: false as const,
            error: {
              kind: "THREAD_NOT_FOUND",
              message: "Thread not found",
            },
          };
        }

        // Check if thread is already processing
        if (thread.isProcessing) {
          return {
            success: false as const,
            error: {
              kind: "THREAD_PROCESSING",
              message: "Thread is already processing a message. Please wait.",
            },
          };
        }

        // For existing thread, active_session_id is stored on thread
        isNewThread = false;
      }

      // Ensure threadId is defined before proceeding
      if (!threadId) {
        console.error("[CLIAgent] Failed to create or retrieve agent thread", {
          projectId: project._id,
          agentType: normalizedAgentType,
        });
        return {
          success: false as const,
          error: {
            kind: "THREAD_CREATION_FAILED",
            message: "Failed to create or retrieve agent thread",
          },
        };
      }

      // Persist the selected Freebuff model on the thread so this run and any
      // follow-up messages run the matching bundled agent. Use the
      // gate-resolved model: limited-tier (geo) users get premium selections
      // coerced to a limited-tier model.
      const resolvedFreebuffModel = gates.freebuffModel;
      if (resolvedFreebuffModel) {
        await ctx.db.patch(threadId, {
          selected_freebuff_model: resolvedFreebuffModel,
        });
      }

      const threadTitle = formatInitialUserMessageThreadTitle(args.message);
      let shouldSetInitialThreadTitle = false;

      if (threadTitle) {
        const thread = await ctx.db.get(threadId);
        const hasTitle = Boolean(thread?.title?.trim());

        if (!hasTitle) {
          const existingMessages = await ctx.db
            .query("agent_message")
            .withIndex("by_thread_active", (q) =>
              q
                .eq("thread_id", threadId)
                .eq("isStreaming", false)
                .eq("deactivated", false),
            )
            .order("asc")
            .collect();

          shouldSetInitialThreadTitle = !existingMessages.some(
            (message) => message.user_message?.trim(),
          );
        }
      }

      // The Freebuff runId doubles as the message session_id. Setting it at
      // creation time (instead of from the agent action later) saves a
      // round-trip and means cancel works even before the action starts.
      const runId = crypto.randomUUID();

      // Create agent message (already isStreaming=true, state=Processing)
      const messageId = await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.createAgentMessage,
        {
          threadId,
          userMessage: args.message,
          sessionId: runId,
          images: args.images,
        },
      );
      messageIdForCleanup = messageId;

      if (shouldSetInitialThreadTitle) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_thread
            .updateAgentThreadTitleInternal,
          {
            threadId,
            title: threadTitle,
          },
        );
      }

      if (resolvedFreebuffModel) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageModel,
          {
            messageId,
            modelUsed: resolvedFreebuffModel,
          },
        );
      }

      // Mark thread as processing
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_thread
          .updateAgentThreadProcessing,
        {
          threadId,
          isProcessing: true,
        },
      );
      threadIdForCleanup = threadId;

      // Schedule checkpoint creation for non-first messages (runs asynchronously)
      if (!isNewThread) {
        await ctx.scheduler.runAfter(
          0,
          internal.coding_agent.cli_agent.trigger
            .createCheckpointForAgentMessage,
          {
            projectId: project._id,
            messageId,
            message: `Before: ${args.message.slice(0, 100)}${args.message.length > 100 ? "..." : ""}`,
          }, // TODO: ensure characters are properly escaped
        );
      }

      // Run ledger entry (queued) — powers cancellation, the timeout sweep
      // cron, and the latency instrumentation (queued_at → started_at).
      await ctx.runMutation(
        internal.coding_agent.cli_agent.freebuff_agent_run_mutations
          .createFreebuffAgentRun,
        {
          runId,
          userId: user._id,
          projectId: project._id,
          threadId,
          messageId,
        },
      );

      // Enqueue the agent action directly via the Convex scheduler. There is
      // no per-pool concurrency cap, so concurrent users never queue behind
      // each other — every send schedules its own action immediately.
      const scheduledId = await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.cli_agent.executeFreebuff.runFreebuffAgent,
        {
          runId,
          userId: user._id,
          projectId: project._id,
          threadId,
          messageId,
          userMessage: args.message,
          freebuffModel: resolvedFreebuffModel,
          images: args.images,
          sandboxId: project.sandbox_id,
          packageManager: project.packageManager,
        },
      );

      // Stored on the run ledger so cancel can call `scheduler.cancel(...)` if
      // the user terminates before the action picks it up. (Field is named
      // `work_id` for backwards compatibility with rows from the workpool era.)
      await ctx.runMutation(
        internal.coding_agent.cli_agent.freebuff_agent_run_mutations
          .setFreebuffAgentRunWorkId,
        {
          runId,
          workId: String(scheduledId),
        },
      );

      // Update project state
      await ctx.db.patch(project._id, {
        terminated: false,
        state: "processing",
      });

      await ctx.runMutation(internal.admin_usage.bumpUserAgentInvocation, {
        userId: user._id,
        source: "cli",
      });

      return { success: true as const };
    } catch (error) {
      console.error(
        "[CLIAgent] Unexpected error in saveMessageAndStartWorkflow:",
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";

      // Roll back partial writes so the thread isn't stuck "Processing" and
      // the message doesn't show a phantom streaming state forever.
      try {
        if (messageIdForCleanup) {
          await ctx.runMutation(
            internal.coding_agent.cli_agent.agent_message
              .updateAgentMessageState,
            {
              messageId: messageIdForCleanup,
              state: "Error",
              stateMessage: errorMessage,
            },
          );
        }
        if (threadIdForCleanup) {
          await ctx.runMutation(
            internal.coding_agent.cli_agent.agent_thread
              .updateAgentThreadProcessing,
            { threadId: threadIdForCleanup, isProcessing: false },
          );
        }
      } catch (cleanupError) {
        console.error(
          "[CLIAgent] Failed to roll back processing state after error:",
          cleanupError,
        );
      }

      return {
        success: false as const,
        error: {
          kind: "INTERNAL_ERROR",
          message: errorMessage,
        },
      };
    }
  },
});

// TODO: fix this later

// Internal action to create checkpoint for agent message
export const createCheckpointForAgentMessage = internalAction({
  args: {
    projectId: v.id("project"),
    messageId: v.id("agent_message"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const checkpointResult = await ctx.runAction(
        internal.versioning.checkpoint.createCheckpoint,
        {
          projectId: args.projectId,
          message: args.message,
          messageId: undefined, // Agent messages don't use the old message system
        },
      );

      if (checkpointResult.success && checkpointResult.checkpointId) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: checkpointResult.checkpointId,
            commitHash: checkpointResult.checkpointId, // checkpointId is the commit hash
          },
        );
      } else if (checkpointResult.error) {
        console.error(
          `[CLIAgent] Failed to create checkpoint: ${checkpointResult.error}`,
        );
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: "failed",
            commitHash: undefined,
          },
        );
      }
    } catch (error) {
      console.error("[CLIAgent] Exception during checkpoint creation:", error);
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message
          .updateAgentMessageCheckpoint,
        {
          messageId: args.messageId,
          checkpointId: "failed",
          commitHash: undefined,
        },
      );
    }
  },
});
