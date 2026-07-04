import { internalMutation, type MutationCtx } from "!/_generated/server";
import { internal } from "!/_generated/api";
import { v } from "convex/values";
import { Id } from "!/_generated/dataModel";
import { CLOUD_TURN_BUDGET_MS, CLI_AGENT_TIMEOUT_MESSAGE } from "./timeLimits";
import { finalizeMessageStream } from "./agent_message_stream";

// Cloud (connected_repo) chaining for the Codex / Claude Code CLI agents.
//
// Web/template projects keep the original behavior: when a CLI run hits its
// per-action time limit it Pauses and the user must click "continue". Cloud
// projects instead transparently chain another action that resumes the SAME
// CLI session (via the session id already persisted on the thread), so a single
// user turn can cross the ~10-minute Convex action ceiling up to
// CLOUD_TURN_BUDGET_MS (default 20 min). This mirrors the Freebuff continuation
// loop in executeFreebuff.ts, but reuses the existing workflow + execute path
// (and therefore all of Codex/Claude's auth, resume, and streaming logic).

// Called by handleWorkflowComplete when a Codex/Claude run returns
// timedOut=true. For connected_repo projects still within the turn budget, this
// reschedules a fresh workflow that resumes the saved session and keeps the
// message streaming; otherwise it falls back to the canonical Paused state so
// the user can resume manually. Returns whether a continuation was scheduled.
export const continueOrPauseCloudCliAgent = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    messageId: v.id("agent_message"),
    projectId: v.id("project"),
    userId: v.optional(v.id("users")),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({ continued: v.boolean() }),
  handler: async (ctx, args): Promise<{ continued: boolean }> => {
    const project = await ctx.db.get(args.projectId);
    const isCloud = project?.project_type === "connected_repo";

    const message = await ctx.db.get(args.messageId);

    // Only Codex / Claude on cloud projects chain. Freebuff has its own loop;
    // Gemini is disabled.
    const eligible =
      isCloud &&
      (args.agentType === "Codex" || args.agentType === "Claude Code");

    const turnStartedAt = message?.cloud_turn_started_at;
    const withinBudget =
      typeof turnStartedAt === "number" &&
      Date.now() - turnStartedAt < CLOUD_TURN_BUDGET_MS;

    // We can only resume a CLI session if we actually captured a session id
    // (persisted on the thread by the executor). Without it, resuming would
    // start a fresh conversation and lose context — pause instead.
    const thread = await ctx.db.get(args.threadId);
    const resumeSessionId =
      args.sessionId || thread?.active_session_id || undefined;

    if (!eligible || !withinBudget || !resumeSessionId || !args.userId) {
      await pauseWithTimeout(ctx, args.messageId, {
        threadId: args.threadId,
        projectId: args.projectId,
      });
      // Clear the per-turn marker so the next user turn starts a fresh budget.
      if (message?.cloud_turn_started_at !== undefined) {
        await ctx.db.patch(args.messageId, { cloud_turn_started_at: undefined });
      }
      return { continued: false };
    }

    // Keep the message in a streaming/processing state across the chain so the
    // UI doesn't flicker to Paused between actions.
    await ctx.db.patch(args.messageId, {
      state: "Processing",
      isStreaming: true,
      state_message: undefined,
    });

    // `handleWorkflowComplete` clears this flag before asking whether a cloud
    // turn should continue. Re-set it here so server-side send gates and the
    // idle sweep still treat the chained turn as in flight.
    await ctx.db.patch(args.threadId, {
      isProcessing: true,
      workflow_id: undefined,
      last_edited_timestamp: Date.now(),
    });

    // Resume the same session in a fresh workflow. The executor reads
    // thread.active_session_id, so ensure it's set to the session we're
    // resuming before we start.
    if (thread?.active_session_id !== resumeSessionId) {
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_thread
          .updateAgentThreadActiveSessionId,
        {
          threadId: args.threadId,
          activeSessionId: resumeSessionId,
          agentType: args.agentType,
        },
      );
    }

    await ctx.scheduler.runAfter(
      0,
      internal.coding_agent.cli_agent.cloudCliChaining.startCloudCliContinuation,
      {
        threadId: args.threadId,
        messageId: args.messageId,
        projectId: args.projectId,
        userId: args.userId,
        agentType: args.agentType,
      },
    );

    return { continued: true };
  },
});

// Starts a continuation workflow for a cloud CLI turn. Split out from the
// mutation above because workflow.start must run from a mutation that also
// records the workflow id on the thread.
export const startCloudCliContinuation = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    messageId: v.id("agent_message"),
    projectId: v.id("project"),
    userId: v.optional(v.id("users")),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
  },
  handler: async (ctx, args) => {
    if (!args.userId) {
      await pauseWithTimeout(ctx, args.messageId, {
        threadId: args.threadId,
        projectId: args.projectId,
      });
      return;
    }

    // Re-check cancellation before chaining: the user may have terminated the
    // thread while the previous action was finishing.
    const message = await ctx.db.get(args.messageId);
    if (!message || message.state === "Cancelled" || message.deactivated) {
      return;
    }

    const { workflow } = await import("./workflow");

    const workflowId = await workflow.start(
      ctx,
      internal.coding_agent.cli_agent.workflow.cliAgentWorkflow,
      {
        messageId: args.messageId,
        threadId: args.threadId,
        projectId: args.projectId,
        userId: args.userId,
        agentType: args.agentType,
      },
      {
        onComplete:
          internal.coding_agent.cli_agent.workflow.handleWorkflowComplete,
        context: {
          threadId: args.threadId,
          messageId: args.messageId,
          projectId: args.projectId,
          userId: args.userId,
          agentType: args.agentType,
        },
      },
    );

    await ctx.runMutation(
      internal.coding_agent.cli_agent.agent_thread.updateAgentThreadWorkflowId,
      {
        threadId: args.threadId,
        workflowId,
      },
    );

    await ctx.db.patch(args.threadId, {
      isProcessing: true,
      last_edited_timestamp: Date.now(),
    });

    await ctx.db.patch(args.projectId, {
      terminated: false,
      state: "processing",
    });
  },
});

async function pauseWithTimeout(
  ctx: MutationCtx,
  messageId: Id<"agent_message">,
  opts?: { threadId?: Id<"agent_thread">; projectId?: Id<"project"> },
) {
  await finalizeMessageStream(ctx, messageId, {
    extraItems: [
      {
        type: "timeout_continue",
        title: "Time limit reached",
        content: CLI_AGENT_TIMEOUT_MESSAGE,
      },
    ],
    messagePatch: {
      state: "Paused",
      state_message: CLI_AGENT_TIMEOUT_MESSAGE,
      isStreaming: false,
    },
  });
  if (opts?.threadId) {
    await ctx.db.patch(opts.threadId, {
      isProcessing: false,
      workflow_id: undefined,
      last_edited_timestamp: Date.now(),
    });
  }
  if (opts?.projectId) {
    await ctx.db.patch(opts.projectId, { state: "active" });
  }
}
