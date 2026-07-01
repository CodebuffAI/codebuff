import { internalAction, mutation, MutationCtx } from "!/_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "!/_generated/dataModel";
import { internal } from "../../_generated/api";
import {
  createAgentThread,
  formatInitialUserMessageThreadTitle,
} from "./agent_thread";
import {
  WEB_TURN_DEADLINE_MS,
  CLOUD_TURN_DEADLINE_MS,
} from "./timeLimits";
import { workflow } from "./workflow";
import { runTriggerGates } from "../shared/triggerGates";

/**
 * Shared post-gate run-start logic for a Freebuff/CLI agent send: resolves (or
 * creates) the agent thread, inserts the user message, opens the run ledger,
 * and schedules the agent action inside the project's Daytona sandbox.
 *
 * Used by the human send path (`saveMessageAndStartWorkflow`) and the scheduled
 * automation path (`internal.automations.startAutomationRun`). Callers MUST run
 * the gates (rate limit / quota / pause) before calling this. Owns its own
 * rollback so a mid-way failure never leaves a thread stuck "Processing".
 */
export async function startFreebuffRunCore(args: {
  ctx: MutationCtx;
  user: Doc<"users">;
  project: Doc<"project">;
  message: string;
  agentType: "Claude Code" | "Gemini CLI" | "Codex" | "Freebuff";
  /** Gate-resolved Freebuff model (already tier-coerced). Freebuff only. */
  resolvedFreebuffModel?: string;
  images?: Id<"_storage">[];
  /** Automations: always start a fresh, independent thread — never reuse or
   *  block on the project's interactive `active_agent_thread`. */
  forceNewThread?: boolean;
  /** Stamped onto the run ledger row for per-automation run history. */
  automationId?: Id<"automation">;
}): Promise<
  | { success: true; threadId: Id<"agent_thread">; runId?: string }
  | {
      success: false;
      error: { kind: string; retryAfter?: number; message?: string };
    }
> {
  const { ctx, user, project, agentType } = args;

  // Track partial writes so the catch block can roll them back. Without this, a
  // failure after "mark processing" leaves the thread permanently stuck in a
  // Processing state that blocks all future sends.
  let threadIdForCleanup: Id<"agent_thread"> | undefined;
  let messageIdForCleanup: Id<"agent_message"> | undefined;
  try {
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
    let threadId: Id<"agent_thread"> | undefined;
    let isNewThread = false;

    if (args.forceNewThread) {
      // Automations: always a fresh, independent thread so a fire never blocks
      // on THREAD_PROCESSING and never hijacks the user's interactive thread
      // pointer. Treated as new (skips checkpoint-before-message).
      threadId = await createAgentThread(ctx, project._id, agentType);
      isNewThread = true;
    } else {
      threadId = project.active_agent_thread;

      if (!threadId) {
        // Create new thread (no active_session_id)
        threadId = await createAgentThread(ctx, project._id, agentType);

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
    }

    // Ensure threadId is defined before proceeding
    if (!threadId) {
      console.error("[CLIAgent] Failed to create or retrieve agent thread", {
        projectId: project._id,
        agentType,
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
    // follow-up messages run the matching bundled agent. Use the gate-resolved
    // model: limited-tier (geo) users get premium selections coerced to a
    // limited-tier model.
    const resolvedFreebuffModel =
      agentType === "Freebuff" ? args.resolvedFreebuffModel : undefined;
    if (resolvedFreebuffModel && agentType === "Freebuff") {
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
    // Codex/Claude generate their own session IDs at runtime, so we leave
    // session_id undefined here for them.
    const runId = agentType === "Freebuff" ? crypto.randomUUID() : undefined;

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

    // Hard watchdog deadline (absolute wall-clock) for this turn. The watchdog
    // cron force-finishes the message (Paused) past this time no matter what,
    // so a stuck agent can never hold the thread in "processing" forever.
    // Cloud (connected_repo) gets the full chained-turn budget; everything
    // else gets the single-action web limit.
    const turnDeadlineMs =
      project.project_type === "connected_repo"
        ? CLOUD_TURN_DEADLINE_MS
        : WEB_TURN_DEADLINE_MS;
    await ctx.db.patch(messageId, {
      processing_deadline_at: Date.now() + turnDeadlineMs,
    });

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

    if (resolvedFreebuffModel && agentType === "Freebuff") {
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.updateAgentMessageModel,
        {
          messageId,
          modelUsed: resolvedFreebuffModel,
        },
      );
    }

    // Mark thread as processing
    await ctx.runMutation(
      internal.coding_agent.cli_agent.agent_thread.updateAgentThreadProcessing,
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
        internal.coding_agent.cli_agent.trigger.createCheckpointForAgentMessage,
        {
          projectId: project._id,
          messageId,
          message: `Before: ${args.message.slice(0, 100)}${args.message.length > 100 ? "..." : ""}`,
        }, // TODO: ensure characters are properly escaped
      );
    }

    if (agentType === "Freebuff") {
      if (!runId) {
        throw new Error("Missing Freebuff run id");
      }

      // Run ledger entry (queued) — powers cancellation, the timeout sweep
      // cron, and the latency instrumentation (queued_at → started_at).
      await ctx.runMutation(
        internal.coding_agent.cli_agent.freebuff_agent_run_mutations
          .createFreebuffAgentRun,
        {
          runId: runId,
          userId: user._id,
          projectId: project._id,
          threadId,
          messageId,
          ...(args.automationId ? { automationId: args.automationId } : {}),
        },
      );

      // Enqueue the agent action directly via the Convex scheduler. There is
      // no per-pool concurrency cap, so concurrent users never queue behind
      // each other — every send schedules its own action immediately.
      const scheduledId = await ctx.scheduler.runAfter(
        0,
        internal.coding_agent.cli_agent.executeFreebuff.runFreebuffAgent,
        {
          runId: runId,
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
          runId: runId,
          workId: String(scheduledId),
        },
      );
    } else {
      // Cloud (connected_repo) Codex/Claude turns chain across the per-action
      // limit. Stamp the turn start so the chaining loop can measure elapsed
      // wall-clock against CLOUD_TURN_BUDGET_MS. Web/template projects leave
      // this unset and keep the manual pause/continue behavior.
      if (
        project.project_type === "connected_repo" &&
        (agentType === "Codex" || agentType === "Claude Code")
      ) {
        await ctx.db.patch(messageId, {
          cloud_turn_started_at: Date.now(),
        });
      }

      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.updateAgentMessageState,
        {
          messageId,
          state: "Processing",
        },
      );

      const workflowId = await workflow.start(
        ctx,
        internal.coding_agent.cli_agent.workflow.cliAgentWorkflow,
        {
          messageId,
          threadId,
          projectId: project._id,
          userId: user._id,
          agentType,
        },
        {
          onComplete:
            internal.coding_agent.cli_agent.workflow.handleWorkflowComplete,
          context: {
            threadId,
            messageId,
            projectId: project._id,
            userId: user._id,
            agentType,
          },
        },
      );

      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_thread.updateAgentThreadWorkflowId,
        {
          threadId,
          workflowId,
        },
      );
    }

    // Update project state
    await ctx.db.patch(project._id, {
      terminated: false,
      state: "processing",
    });

    await ctx.runMutation(internal.admin_usage.bumpUserAgentInvocation, {
      userId: user._id,
      source: "cli",
    });

    return { success: true as const, threadId, runId };
  } catch (error) {
    console.error("[CLIAgent] Unexpected error in startFreebuffRunCore:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";

    // Roll back partial writes so the thread isn't stuck "Processing" and the
    // message doesn't show a phantom streaming state forever.
    try {
      if (messageIdForCleanup) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.updateAgentMessageState,
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
}

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
    const gates = await runTriggerGates({
      ctx,
      message: args.message,
      projectSemanticIdentifier: args.projectSemanticIdentifier,
      projectId: args.projectId,
      skipRateLimitCheck: args._skipRateLimitCheck,
      agentType: args.agentType,
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

    // Freebuff Cloud DAU: record Cloud-specific activity for connected_repo
    // (Cloud) projects only. O(1), scheduled, can never break the send.
    if (project.project_type === "connected_repo") {
      await ctx.scheduler.runAfter(0, internal.activity.recordCloudActivity, {
        userId: user._id,
      });
    } else {
      // Freebuff Web DAU: template / legacy Web projects (non-connected_repo).
      await ctx.scheduler.runAfter(0, internal.activity.recordWebActivity, {
        userId: user._id,
      });
    }

    // Admin metrics: O(1) daily counter per agent type (no message scans).
    await ctx.scheduler.runAfter(
      0,
      internal.admin_agent_stats.recordAgentPrompt,
      { agentType: args.agentType },
    );

    // DAU signal in PostHog: one event per user-submitted web message. Keyed
    // by the canonical codebuff user id (users.freebuff_user_id = the JWT
    // subject = the Postgres user id) so it unions with the cli and chat
    // surfaces. Legacy users without a freebuff_user_id are skipped here;
    // they still count toward the Convex `recordActivity` DAU above. The
    // event name mirrors AnalyticsEvent.MESSAGE_SENT in @codebuff/common.
    if (user.freebuff_user_id) {
      await ctx.scheduler.runAfter(0, internal.analytics.captureEvent, {
        event: "message_sent",
        distinctId: user.freebuff_user_id,
        properties: {
          surface: "web",
          agentType: args.agentType,
          accessTier: gates.accessTier,
        },
      });
    }

    const result = await startFreebuffRunCore({
      ctx,
      user,
      project,
      message: args.message,
      agentType: args.agentType,
      resolvedFreebuffModel:
        args.agentType === "Freebuff" ? gates.freebuffModel : undefined,
      images: args.images,
      forceNewThread: false,
    });

    if (!result.success) {
      return { success: false as const, error: result.error };
    }

    return { success: true as const };
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
