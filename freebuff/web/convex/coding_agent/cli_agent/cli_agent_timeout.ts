import { internalMutation } from "!/_generated/server";
import { internal } from "!/_generated/api";
import {
  CRON_SWEEP_TIMEOUT_MS,
  CLI_AGENT_TIMEOUT_MESSAGE,
  HARD_DEADLINE_GRACE_MS,
} from "./timeLimits";
import { finalizeMessageStream } from "./agent_message_stream";

// 10-minute cron sweep for stuck Codex / Claude Code agent runs. Mirrors the
// Freebuff implementation in `freebuff_bridge_mutations.sweepTimedOutFreebuffRuns`
// (registered in `crons.ts`) but operates on `agent_thread` + `agent_message`
// directly because Codex/Claude don't have a dedicated run ledger like Freebuff.
//
// Detection rule: a thread is considered stuck when
//   - agent_type is `Codex` or `Claude Code`
//   - isProcessing === true
//   - last_edited_timestamp is older than 10 minutes
// For each stuck thread we mark the latest streaming message as `Cancelled`
// with the canonical timeout copy, append a `timeout_continue` activity item,
// clear thread processing state, and reset the project state.

const CLI_AGENT_CRON_TIMEOUT_MS = CRON_SWEEP_TIMEOUT_MS;

export const sweepTimedOutCliAgentRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - CLI_AGENT_CRON_TIMEOUT_MS;

    // Threads currently flagged as processing. Number of concurrent processing
    // threads is small in practice (one per active user run), so a filtered
    // collect is acceptable at the 1-minute cron cadence.
    const processingThreads = await ctx.db
      .query("agent_thread")
      .filter((q) => q.eq(q.field("isProcessing"), true))
      .collect();

    let timedOut = 0;
    for (const thread of processingThreads) {
      if (
        thread.agent_type !== "Codex" &&
        thread.agent_type !== "Claude Code"
      ) {
        continue;
      }
      if (thread.last_edited_timestamp >= cutoff) {
        continue;
      }

      // Latest active streaming message on this thread.
      const message = await ctx.db
        .query("agent_message")
        .withIndex("by_thread_active", (q) =>
          q.eq("thread_id", thread._id).eq("isStreaming", true),
        )
        .order("desc")
        .first();

      if (
        message &&
        message.state === "Processing" &&
        message._creationTime < cutoff
      ) {
        await finalizeMessageStream(ctx, message._id, {
          extraItems: [
            {
              type: "timeout_continue",
              title: "Time limit reached",
              content: CLI_AGENT_TIMEOUT_MESSAGE,
            },
          ],
          messagePatch: {
            state: "Cancelled",
            state_message: CLI_AGENT_TIMEOUT_MESSAGE,
            isStreaming: false,
          },
        });
      }

      await ctx.db.patch(thread._id, {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: now,
      });

      // Reset project state if no other processing threads remain on it.
      const project = await ctx.db.get(thread.project_id);
      if (project && project.state === "processing") {
        const otherProcessing = await ctx.db
          .query("agent_thread")
          .withIndex("by_project", (q) => q.eq("project_id", thread.project_id))
          .filter((q) =>
            q.and(
              q.eq(q.field("isProcessing"), true),
              q.neq(q.field("_id"), thread._id),
            ),
          )
          .collect();
        if (otherProcessing.length === 0) {
          await ctx.db.patch(thread.project_id, { state: "active" });
        }
      }

      timedOut += 1;
    }

    return { timedOut };
  },
});

// Hard absolute-deadline watchdog for ALL CLI/agent runs (Freebuff, Codex,
// Claude Code). This is the last-resort guarantee that a run is force-finished
// after its turn budget, independent of:
//   - the in-action abort timer firing (it may not, if the action hard-crashes
//     or hangs in native code),
//   - idle detection (a chatty-but-stuck agent keeps last_edited fresh, evading
//     the idle sweeps above),
//   - the chaining loop (a missed continuation could otherwise strand the turn).
//
// It keys off agent_message.processing_deadline_at (an absolute wall-clock
// timestamp stamped when the turn started: cloud=20min, web/template=10min) and
// force-finishes any still-streaming message past deadline + grace. The message
// is marked Paused with a `timeout_continue` affordance so the user can resume
// or send again; the thread/project processing state is reset; and the Freebuff
// run ledger (if any) is marked timed_out for consistency.
export const enforceProcessingDeadlines = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - HARD_DEADLINE_GRACE_MS;

    // Streaming messages whose absolute deadline has already passed (with grace).
    // The index is (isStreaming, processing_deadline_at); we scan the streaming
    // partition up to the cutoff. In practice only a handful of messages stream
    // concurrently, so this stays cheap at the 1-minute cadence.
    const overdue = await ctx.db
      .query("agent_message")
      .withIndex("by_processing_deadline", (q) =>
        q.eq("isStreaming", true).lte("processing_deadline_at", cutoff),
      )
      .collect();

    let finished = 0;
    for (const message of overdue) {
      // Guard: index can include rows with an undefined deadline at the low end
      // of the range; skip anything without a real, passed deadline.
      if (
        typeof message.processing_deadline_at !== "number" ||
        message.processing_deadline_at > cutoff
      ) {
        continue;
      }
      // Only force-finish runs that are actually mid-flight.
      if (message.state !== "Processing" || message.deactivated === true) {
        // Stale flag (terminal state but still flagged streaming): normalize it
        // so the index doesn't keep returning it.
        if (message.state !== "Processing") {
          await ctx.db.patch(message._id, {
            isStreaming: false,
            processing_deadline_at: undefined,
          });
        }
        continue;
      }

      await finalizeMessageStream(ctx, message._id, {
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
          processing_deadline_at: undefined,
        },
      });

      const thread = await ctx.db.get(message.thread_id);
      if (thread) {
        await ctx.db.patch(thread._id, {
          isProcessing: false,
          workflow_id: undefined,
          last_edited_timestamp: now,
        });

        const project = await ctx.db.get(thread.project_id);
        if (project && project.state === "processing") {
          const otherProcessing = await ctx.db
            .query("agent_thread")
            .withIndex("by_project", (q) =>
              q.eq("project_id", thread.project_id),
            )
            .filter((q) =>
              q.and(
                q.eq(q.field("isProcessing"), true),
                q.neq(q.field("_id"), thread._id),
              ),
            )
            .collect();
          if (otherProcessing.length === 0) {
            await ctx.db.patch(thread.project_id, { state: "active" });
          }
        }
      }

      // Best-effort: for Freebuff, message.session_id is the run ledger runId.
      // Cancelling it marks the ledger terminal AND cancels any scheduled
      // continuation, stopping the chain so a stuck Freebuff turn can't respawn.
      // Codex/Claude session ids won't resolve to a run, so this is a no-op for
      // them (their chain is stopped by the Paused state + thread reset above).
      if (message.session_id) {
        try {
          await ctx.runMutation(
            internal.coding_agent.cli_agent.freebuff_agent_run_mutations
              .cancelFreebuffAgentRunByRunId,
            { runId: message.session_id },
          );
        } catch {
          // Non-fatal — the message/thread/project are already finalized.
        }
      }

      finished += 1;
    }

    return { finished };
  },
});
