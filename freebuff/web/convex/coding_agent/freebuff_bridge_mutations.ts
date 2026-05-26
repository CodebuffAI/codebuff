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
      await ctx.db.patch(threadId, {
        active_session_id: event.runId,
        active_freebuff_run_state_storage_id: args.runStateStorageId,
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      } as any);
      await ctx.db.patch(thread.project_id, { state: "active" });
    } else if (event.type === "error") {
      patch.state = "Error";
      patch.state_message = String(event.message ?? "Freebuff run failed");
      patch.isStreaming = false;
      await ctx.db.patch(threadId, {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      });
      await ctx.db.patch(thread.project_id, { state: "active" });
    }

    await ctx.db.patch(messageId, patch);
  },
});
