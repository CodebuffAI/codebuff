import { internalMutation } from "!/_generated/server";

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

const CLI_AGENT_CRON_TIMEOUT_MS = 10 * 60 * 1000;
const CLI_AGENT_TIMEOUT_MESSAGE =
  "Maximum time limit for a prompt reached. Engagement required to continue.";

type AssistantStreamItem = {
  type: string;
  title?: string;
  status?: string;
  content: string;
  description?: string;
};

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
        const existingStream = (message.assistant_stream ??
          []) as AssistantStreamItem[];
        const nextStream: AssistantStreamItem[] = [
          ...existingStream,
          {
            type: "timeout_continue",
            title: "Time limit reached",
            content: CLI_AGENT_TIMEOUT_MESSAGE,
          },
        ];
        await ctx.db.patch(message._id, {
          state: "Cancelled",
          state_message: CLI_AGENT_TIMEOUT_MESSAGE,
          isStreaming: false,
          assistant_stream: nextStream,
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
