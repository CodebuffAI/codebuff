import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

type AssistantStreamItem = {
  type: string;
  title?: string;
  status?: string;
  content: string;
  description?: string;
};

const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "paused",
  "error",
  "timed_out",
]);

function appendOrMergeStreamItem(
  assistantStream: AssistantStreamItem[],
  item: AssistantStreamItem,
) {
  if (!item.content) return;

  const previous = assistantStream[assistantStream.length - 1];
  const canMerge =
    previous &&
    previous.type === item.type &&
    previous.title === item.title &&
    previous.status === item.status &&
    previous.description === item.description &&
    (item.type === "text" ||
      item.type === "reasoning" ||
      item.type === "subagent");

  if (canMerge) {
    previous.content += item.content;
    return;
  }

  assistantStream.push(item);
}

function compactAssistantStream(items: AssistantStreamItem[]) {
  const compacted: AssistantStreamItem[] = [];
  for (const item of items) {
    appendOrMergeStreamItem(compacted, { ...item });
  }
  return compacted;
}

export const recordRunEvent = internalMutation({
  args: {
    event: v.any(),
    runStateStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const event = args.event as any;
    const now = Date.now();
    if (event.runId) {
      const runDoc = await ctx.db
        .query("freebuff_agent_runs")
        .withIndex("by_run_id", (q) => q.eq("run_id", String(event.runId)))
        .unique();

      if (runDoc && !TERMINAL_RUN_STATUSES.has(runDoc.status)) {
        const runPatch: Record<string, any> = { last_event_at: now };
        if (event.type === "start") {
          runPatch.status = "running";
          runPatch.started_at = runDoc.started_at ?? now;
        } else if (event.type === "final") {
          runPatch.status = "completed";
          runPatch.completed_at = now;
        } else if (event.type === "ask_user_pause") {
          runPatch.status = "paused";
        } else if (event.type === "time_limit_pause") {
          runPatch.status = "timed_out";
          runPatch.timed_out_at = now;
          runPatch.error = String(
            event.message ??
              "Maximum time limit for a prompt reached. Engagement required to continue.",
          );
        } else if (event.type === "error") {
          runPatch.status = "error";
          runPatch.error = String(event.message ?? "Freebuff run failed");
          runPatch.completed_at = now;
        }
        await ctx.db.patch(runDoc._id, runPatch);
      } else if (runDoc) {
        return { ignored: true, status: runDoc.status };
      }
    }

    const messageId = event.messageId as Id<"agent_message">;
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Agent message not found");

    const threadId = event.threadId as Id<"agent_thread">;
    const thread = await ctx.db.get(threadId);
    if (!thread || message.thread_id !== threadId) {
      throw new Error("Thread/message mismatch");
    }

    if (thread.project_id !== (event.projectId as Id<"project">)) {
      throw new Error("Project/thread mismatch");
    }

    const assistantStream = compactAssistantStream(
      (message.assistant_stream ?? []) as AssistantStreamItem[],
    );

    if (event.type === "text_delta") {
      appendOrMergeStreamItem(assistantStream, {
        type: "text",
        content: String(event.chunk ?? ""),
      });
    } else if (event.type === "reasoning_delta") {
      appendOrMergeStreamItem(assistantStream, {
        type: "reasoning",
        title: "Reasoning",
        content: String(event.chunk ?? ""),
      });
    } else if (event.type === "subagent_delta") {
      appendOrMergeStreamItem(assistantStream, {
        type: "subagent",
        title: event.agentType,
        content: String(event.chunk ?? ""),
      });
    } else if (event.type === "status") {
      assistantStream.push({
        type: "status",
        title: event.title ?? event.status,
        content: String(event.content ?? event.status ?? ""),
      });
    } else if (event.type === "ask_user_pause") {
      assistantStream.push({
        type: "ask_user",
        title: "Question",
        content: JSON.stringify({
          questions: Array.isArray(event.questions) ? event.questions : [],
        }),
      });
    } else if (event.type === "time_limit_pause") {
      assistantStream.push({
        type: "timeout_continue",
        title: "Time limit reached",
        content: String(
          event.message ??
            "Maximum time limit for a prompt reached. Engagement required to continue.",
        ),
      });
    } else if (event.type === "error") {
      assistantStream.push({
        type: "error",
        title: "Freebuff error",
        content: String(event.message ?? "Unknown Freebuff error"),
      });
    }

    const patch: Record<string, any> = {
      assistant_stream: assistantStream,
    };

    if (event.type === "start") {
      patch.state = "Processing";
      patch.isStreaming = true;
    } else if (event.type === "final") {
      patch.state = "Completed";
      patch.isStreaming = false;
      patch.session_id = event.runId;
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      };
      if (event.preserveThreadSession !== true) {
        threadPatch.active_session_id = event.runId;
        if (args.runStateStorageId !== undefined) {
          threadPatch.active_freebuff_run_state_storage_id =
            args.runStateStorageId;
        }
      }
      await ctx.db.patch(threadId, threadPatch as any);
      await ctx.db.patch(thread.project_id, { state: "active" });
    } else if (event.type === "error") {
      patch.state = "Error";
      patch.state_message = String(event.message ?? "Freebuff run failed");
      patch.isStreaming = false;
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      };
      if (args.runStateStorageId) {
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId;
      }
      await ctx.db.patch(threadId, threadPatch as any);
      await ctx.db.patch(thread.project_id, { state: "active" });
    } else if (event.type === "time_limit_pause") {
      patch.state = "Paused";
      patch.state_message =
        "Maximum time limit for a prompt reached. Engagement required to continue.";
      patch.isStreaming = false;
      patch.session_id = event.runId;
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      };
      if (event.preserveThreadSession !== true) {
        threadPatch.active_session_id = event.runId;
      }
      if (event.preserveThreadSession !== true && args.runStateStorageId) {
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId;
      }
      await ctx.db.patch(threadId, threadPatch as any);
      await ctx.db.patch(thread.project_id, { state: "active" });
    } else if (event.type === "ask_user_pause") {
      patch.state = "Paused";
      patch.state_message = "Waiting for your answer";
      patch.isStreaming = false;
      patch.session_id = event.runId;
      const threadPatch: Record<string, any> = {
        active_session_id: event.runId,
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      };
      if (args.runStateStorageId) {
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId;
      }
      await ctx.db.patch(threadId, threadPatch as any);
      await ctx.db.patch(thread.project_id, { state: "active" });
    }

    await ctx.db.patch(messageId, patch);
  },
});

export const sweepTimedOutFreebuffRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - 10 * 60 * 1000;

    const staleRunning = await ctx.db
      .query("freebuff_agent_runs")
      .withIndex("by_status_started_at", (q) =>
        q.eq("status", "running").lt("started_at", cutoff),
      )
      .collect();

    const queuedRuns = await ctx.db
      .query("freebuff_agent_runs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    const staleQueued = queuedRuns.filter((run) => run.queued_at < cutoff);

    let timedOut = 0;
    for (const runDoc of [...staleRunning, ...staleQueued]) {
      const latestRunDoc = await ctx.db.get(runDoc._id);
      if (!latestRunDoc || TERMINAL_RUN_STATUSES.has(latestRunDoc.status)) {
        continue;
      }

      const message = await ctx.db.get(latestRunDoc.message_id);
      const thread = await ctx.db.get(latestRunDoc.thread_id);

      await ctx.db.patch(latestRunDoc._id, {
        status: "timed_out",
        timed_out_at: now,
        error:
          "Maximum time limit for a prompt reached. Engagement required to continue.",
        last_event_at: now,
      });

      if (message) {
        const assistantStream = compactAssistantStream(
          (message.assistant_stream ?? []) as AssistantStreamItem[],
        );
        assistantStream.push({
          type: "timeout_continue",
          title: "Time limit reached",
          content:
            "Maximum time limit for a prompt reached. Engagement required to continue.",
        });
        await ctx.db.patch(latestRunDoc.message_id, {
          state: "Cancelled",
          state_message:
            "Maximum time limit for a prompt reached. Engagement required to continue.",
          isStreaming: false,
          assistant_stream: assistantStream,
        });
      }

      if (thread) {
        await ctx.db.patch(latestRunDoc.thread_id, {
          isProcessing: false,
          workflow_id: undefined,
          last_edited_timestamp: now,
        });
        await ctx.db.patch(thread.project_id, { state: "active" });
      }

      timedOut += 1;
    }

    return { timedOut };
  },
});
