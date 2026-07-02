import { query, internalQuery } from "!/_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../../_generated/api";
import { getVerifiedAccessProject } from "../../project";
import { getAuthUser } from "../../users";

// Internal cacheable version for verified project lookup
// Pagination must stay in main query, but we can cache the project verification
//
// IMPORTANT: returns only the stable fields callers actually use (_id and
// active_agent_thread) instead of the whole project doc. The project doc's
// volatile fields (state flips processing/active twice per agent turn,
// preview URLs, timestamps, ...) would otherwise change this query's result on
// every patch and re-push/re-execute every downstream message-list and
// message-body subscription — each of which re-reads its full page of docs.
export const getVerifiedProjectForAgentMessagesInternal = internalQuery({
  args: {
    semanticIdentifier: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await getVerifiedAccessProject(
      ctx,
      args.userId,
      args.semanticIdentifier,
    );
    if (!project) return null;
    return {
      _id: project._id,
      active_agent_thread: project.active_agent_thread,
    };
  },
});

// Get agent thread messages for a project by semantic identifier (non-streaming only)
// Returns up to 60 messages for the active agent thread
export const getAgentThreadMessages = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const projectData = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!projectData) {
      return [];
    }

    if (!projectData.active_agent_thread) {
      return [];
    }

    const threadId = projectData.active_agent_thread;

    // PERFORMANCE FIX: Use by_thread_active index to filter by thread, isStreaming, and deactivated
    // This is more efficient than using by_thread + filter
    // Note: deactivated=false filters out deactivated messages at the index level
    const messages = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_active", (q) =>
        q
          .eq("thread_id", threadId)
          .eq("isStreaming", false)
          .eq("deactivated", false),
      )
      .order("desc")
      .take(60);

    return messages;
  },
});

export const getLatestAgentCommitHashForProject = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const projectData = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );

    if (!projectData?.active_agent_thread) {
      return null;
    }

    const recentMessages = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_active", (q) =>
        q
          .eq("thread_id", projectData.active_agent_thread!)
          .eq("isStreaming", false)
          .eq("deactivated", false),
      )
      .order("desc")
      .take(40);

    const messageWithCommit = recentMessages.find((message) =>
      Boolean(message.commit_hash),
    );

    if (!messageWithCommit?.commit_hash) {
      return null;
    }

    return {
      commitHash: messageWithCommit.commit_hash,
      threadId: messageWithCommit.thread_id,
      messageId: messageWithCommit._id,
      createdAt: messageWithCommit._creationTime,
    };
  },
});

// Paginated agent thread messages for infinite scroll
export const listAgentThreadMessages = query({
  args: {
    semanticIdentifier: v.string(),
    threadId: v.optional(v.id("agent_thread")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: null } as any;
    }

    // Delegate project verification to internal cached version
    const projectData = await ctx.runQuery(
      internal.coding_agent.cli_agent.queries
        .getVerifiedProjectForAgentMessagesInternal,
      {
        semanticIdentifier: args.semanticIdentifier,
        userId: user._id,
      },
    );

    if (!projectData) {
      return { page: [], isDone: true, continueCursor: null } as any;
    }

    // Use provided threadId or fall back to project's active_agent_thread
    const threadId = args.threadId ?? projectData.active_agent_thread;

    if (!threadId) {
      return { page: [], isDone: true, continueCursor: null } as any;
    }

    // NOTE: Pagination must stay in the main query (cannot delegate to internal query)
    // because Convex cursors are bound to the specific query function
    try {
      // PERFORMANCE FIX: Use by_thread_active index to filter by thread, isStreaming, and deactivated
      // This is more efficient than using by_thread + filter
      // Filters out deactivated messages at the index level
      const page = await ctx.db
        .query("agent_message")
        .withIndex("by_thread_active", (q) =>
          q
            .eq("thread_id", threadId)
            .eq("isStreaming", false)
            .eq("deactivated", false),
        )
        .order("desc")
        .paginate(args.paginationOpts);

      return page;
    } catch (error: any) {
      // Handle invalid cursor errors gracefully by returning empty results
      // This allows the frontend to restart pagination from the beginning
      if (error?.message?.includes("InvalidCursor")) {
        return { page: [], isDone: true, continueCursor: null } as any;
      }
      throw error;
    }
  },
});

// Internal query to get ALL agent thread messages including deactivated ones
// Used for operations like undo/revert that need complete message history
export const getAllAgentThreadMessages = internalQuery({
  args: {
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    // Get ALL messages including deactivated ones
    // Use by_thread index since we want all messages (including deactivated)
    const messages = await ctx.db
      .query("agent_message")
      .withIndex("by_thread", (q) => q.eq("thread_id", args.threadId))
      .filter((q) => q.eq(q.field("isStreaming"), false))
      .order("asc")
      .collect();

    return messages;
  },
});

// Internal cacheable version - accepts projectId and activeThread directly to avoid auth overhead
export const getStreamedAgentMessagesInternal = internalQuery({
  args: {
    projectId: v.id("project"),
    activeThread: v.optional(v.id("agent_thread")),
  },
  handler: async (ctx, args) => {
    if (!args.activeThread) {
      return [];
    }

    const activeThreadId = args.activeThread;

    // PERFORMANCE FIX: Use by_thread_active index to filter by thread, isStreaming, and deactivated
    // This is more efficient than using by_thread + filter
    // Only return the very last streaming message
    const messages = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_active", (q) =>
        q
          .eq("thread_id", activeThreadId)
          .eq("isStreaming", true)
          .eq("deactivated", false),
      )
      .order("desc")
      .take(1);

    return messages;
  },
});

// Internal cacheable version for verified project lookup for streamed messages
// Must stay separate from getStreamedAgentMessagesInternal to allow caching of verification
// Like getVerifiedProjectForAgentMessagesInternal above, returns only the
// stable fields callers use so volatile project-doc patches don't re-push the
// (heavier) parent subscriptions.
export const getVerifiedProjectForStreamedAgentMessagesInternal = internalQuery(
  {
    args: {
      semanticIdentifier: v.string(),
      userId: v.id("users"),
    },
    handler: async (ctx, args) => {
      const project = await getVerifiedAccessProject(
        ctx,
        args.userId,
        args.semanticIdentifier,
      );
      if (!project) return null;
      return {
        _id: project._id,
        active_agent_thread: project.active_agent_thread,
      };
    },
  },
);

// Get streamed agent messages for a project by semantic identifier
export const getStreamedAgentMessages = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<any[]> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    // Delegate project verification to internal cached version
    const projectData = await ctx.runQuery(
      internal.coding_agent.cli_agent.queries
        .getVerifiedProjectForStreamedAgentMessagesInternal,
      {
        semanticIdentifier: args.semanticIdentifier,
        userId: user._id,
      },
    );

    if (!projectData) {
      return [];
    }

    // Delegate to internal cached version to avoid redundant auth checks on subsequent calls
    return await ctx.runQuery(
      internal.coding_agent.cli_agent.queries.getStreamedAgentMessagesInternal,
      {
        projectId: projectData._id,
        activeThread: projectData.active_agent_thread,
      },
    );
  },
});

// Internal cacheable version - tails live streaming deltas for the active
// streaming message. Returns the (light) streaming message plus only the delta
// rows with seq > afterSeq, so the websocket ships new chunks instead of the
// whole growing message on every update.
/**
 * Internal: the id of a project's currently-streaming agent message (if any).
 * Used by the take-over flow to cancel the previously-active project's run.
 */
export const getStreamingMessageIdForProjectInternal = internalQuery({
  args: { projectId: v.id("project") },
  returns: v.union(v.id("agent_message"), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !project.active_agent_thread) return null;
    const messages = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_active", (q) =>
        q
          .eq("thread_id", project.active_agent_thread!)
          .eq("isStreaming", true)
          .eq("deactivated", false),
      )
      .order("desc")
      .take(1);
    return messages[0]?._id ?? null;
  },
});

export const getStreamingMessageDeltasInternal = internalQuery({
  args: {
    activeThread: v.optional(v.id("agent_thread")),
    afterSeq: v.number(),
    // When the client is already tracking a streaming message, it passes the id
    // so we only return deltas newer than afterSeq. If it differs from the
    // current streaming message (a new run started), we return the new message's
    // full delta history instead so the client doesn't miss early chunks.
    afterMessageId: v.optional(v.id("agent_message")),
    // Skip the delta read entirely (callers that only need streaming metadata).
    metaOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.activeThread) {
      return { message: null as any, deltas: [] as any[] };
    }

    const messages = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_active", (q) =>
        q
          .eq("thread_id", args.activeThread!)
          .eq("isStreaming", true)
          .eq("deactivated", false),
      )
      .order("desc")
      .take(1);

    const message = messages[0];
    if (!message) {
      return { message: null as any, deltas: [] as any[] };
    }

    if (args.metaOnly) {
      return { message, deltas: [] as any[] };
    }

    const effectiveAfter =
      args.afterMessageId && args.afterMessageId === message._id
        ? args.afterSeq
        : -1;

    const deltas = await ctx.db
      .query("agent_message_delta")
      .withIndex("by_message_seq", (q) =>
        q.eq("message_id", message._id).gt("seq", effectiveAfter),
      )
      .order("asc")
      .collect();

    return { message, deltas };
  },
});

// Live streaming tail for a project's active thread. Clients pass the highest
// delta seq they've already applied (afterSeq); the query returns only newer
// deltas plus the current streaming message metadata.
export const getStreamingMessageDeltas = query({
  args: {
    semanticIdentifier: v.string(),
    afterSeq: v.optional(v.number()),
    afterMessageId: v.optional(v.id("agent_message")),
    metaOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return { message: null, deltas: [] };
    }

    const projectData = await ctx.runQuery(
      internal.coding_agent.cli_agent.queries
        .getVerifiedProjectForStreamedAgentMessagesInternal,
      {
        semanticIdentifier: args.semanticIdentifier,
        userId: user._id,
      },
    );

    if (!projectData) {
      return { message: null, deltas: [] };
    }

    return await ctx.runQuery(
      internal.coding_agent.cli_agent.queries.getStreamingMessageDeltasInternal,
      {
        activeThread: projectData.active_agent_thread,
        afterSeq: args.afterSeq ?? -1,
        afterMessageId: args.afterMessageId,
        metaOnly: args.metaOnly,
      },
    );
  },
});

// Fetch the immutable coalesced bodies for a set of finalized messages. Bodies
// live in their own table and never change after a run completes, so this
// subscription is not re-pushed when message metadata (cost, checkpoint, etc.)
// is patched — keeping listAgentThreadMessages reads light. Access is authorized
// against the thread via the denormalized thread_id on the body row (no read of
// the mutable agent_message doc, which would re-invalidate the subscription).
export const getMessageBodies = query({
  args: {
    semanticIdentifier: v.string(),
    threadId: v.optional(v.id("agent_thread")),
    messageIds: v.array(v.id("agent_message")),
  },
  handler: async (ctx, args): Promise<Record<string, any[]>> => {
    const result: Record<string, any[]> = {};
    if (args.messageIds.length === 0) {
      return result;
    }

    const user = await getAuthUser(ctx);
    if (!user) {
      return result;
    }

    const projectData = await ctx.runQuery(
      internal.coding_agent.cli_agent.queries
        .getVerifiedProjectForAgentMessagesInternal,
      {
        semanticIdentifier: args.semanticIdentifier,
        userId: user._id,
      },
    );

    if (!projectData) {
      return result;
    }

    const threadId = args.threadId ?? projectData.active_agent_thread;
    if (!threadId) {
      return result;
    }

    for (const messageId of args.messageIds) {
      const body = await ctx.db
        .query("agent_message_body")
        .withIndex("by_message", (q) => q.eq("message_id", messageId))
        .unique();
      if (body && body.thread_id === threadId) {
        result[messageId] = body.stream;
      }
    }

    return result;
  },
});

// Get all agent threads for a project
export const getProjectAgentThreads = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const projectData = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!projectData) {
      return [];
    }

    // Get all agent threads for this project, ordered by last_edited_timestamp (most recent first)
    const threads = await ctx.db
      .query("agent_thread")
      .withIndex("by_project", (q) => q.eq("project_id", projectData._id))
      .order("desc")
      .collect();

    return threads;
  },
});

// Get agent threads with their latest user message preview
export const getProjectAgentThreadsWithPreview = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const projectData = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!projectData) {
      return [];
    }

    // Get all agent threads for this project, ordered by last_edited_timestamp (most recent first)
    const threads = await ctx.db
      .query("agent_thread")
      .withIndex("by_project", (q) => q.eq("project_id", projectData._id))
      .order("desc")
      .collect();

    // For each thread, get the latest user message
    const threadsWithPreview = await Promise.all(
      threads.map(async (thread) => {
        // Get the latest message with a user_message
        // Query all messages and filter client-side for user_message
        const messages = await ctx.db
          .query("agent_message")
          .withIndex("by_thread_active", (q) =>
            q
              .eq("thread_id", thread._id)
              .eq("isStreaming", false)
              .eq("deactivated", false),
          )
          .order("desc")
          .take(10); // Take first 10 to find one with user_message

        const latestMessage = messages.find((msg) => msg.user_message);

        return {
          thread,
          latestUserMessage: latestMessage?.user_message || null,
        };
      }),
    );

    return threadsWithPreview;
  },
});

// Get unified threads (both old and new) with preview
export const getUnifiedThreadsWithPreview = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // Early return for empty/invalid semantic identifier
    if (!args.semanticIdentifier || args.semanticIdentifier.trim() === "") {
      return [];
    }

    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const projectData = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!projectData) {
      return [];
    }

    // Get all agent threads (new threads)
    const agentThreads = await ctx.db
      .query("agent_thread")
      .withIndex("by_project", (q) => q.eq("project_id", projectData._id))
      .order("desc")
      .collect();

    // Get all old threads
    const oldThreads = await ctx.db
      .query("thread")
      .withIndex("by_project_by_entry_point", (q) =>
        q.eq("project", projectData._id),
      )
      .order("desc")
      .collect();

    // Process agent threads with preview
    const agentThreadsWithPreview = await Promise.all(
      agentThreads.map(async (thread) => {
        try {
          const messages = await ctx.db
            .query("agent_message")
            .withIndex("by_thread_active", (q) =>
              q
                .eq("thread_id", thread._id)
                .eq("isStreaming", false)
                .eq("deactivated", false),
            )
            .order("desc")
            .take(10);

          const latestMessage = messages.find((msg) => msg.user_message);

          return {
            thread: {
              ...thread,
              threadType: "agent_thread" as const,
              last_edited_timestamp: thread.last_edited_timestamp,
              isProcessing: thread.isProcessing,
            },
            latestUserMessage: latestMessage?.user_message || null,
          };
        } catch (error) {
          // If there's an error processing a thread, return it without preview
          console.error(`Error processing agent thread ${thread._id}:`, error);
          return {
            thread: {
              ...thread,
              threadType: "agent_thread" as const,
              last_edited_timestamp: thread.last_edited_timestamp,
              isProcessing: thread.isProcessing,
            },
            latestUserMessage: null,
          };
        }
      }),
    );

    // Process old threads with preview
    const oldThreadsWithPreview = await Promise.all(
      oldThreads.map(async (thread) => {
        try {
          // Get latest user message from old thread
          // Use the same pattern as project.ts - index uses thread_id
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_thread", (q) =>
              q.eq("thread_id", thread._id).eq("streaming", false),
            )
            .order("desc")
            .take(10);

          const latestUserMessage = messages.find(
            (msg) => msg.role === "user" && !msg.deactivated,
          );

          return {
            thread: {
              _id: thread._id,
              title: thread.title,
              threadType: "thread" as const,
              last_edited_timestamp: thread._creationTime, // Old threads don't have last_edited_timestamp, use _creationTime
              agent_type: "Freebuff" as const,
            },
            latestUserMessage: latestUserMessage?.content || null,
          };
        } catch (error) {
          // If there's an error processing a thread, return it without preview
          console.error(`Error processing old thread ${thread._id}:`, error);
          return {
            thread: {
              _id: thread._id,
              title: thread.title,
              threadType: "thread" as const,
              last_edited_timestamp: thread._creationTime,
              agent_type: "Freebuff" as const,
            },
            latestUserMessage: null,
          };
        }
      }),
    );

    // Combine and sort by last_edited_timestamp
    const allThreads = [
      ...agentThreadsWithPreview,
      ...oldThreadsWithPreview,
    ].sort(
      (a, b) =>
        (b.thread.last_edited_timestamp || 0) -
        (a.thread.last_edited_timestamp || 0),
    );

    return allThreads;
  },
});

// Paginated query for agent messages (for deactivation)
export const getAgentMessagesPaginated = internalQuery({
  args: {
    threadId: v.id("agent_thread"),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("agent_message")
      .withIndex("by_thread_active", (q) =>
        q
          .eq("thread_id", args.threadId)
          .eq("isStreaming", false)
          .eq("deactivated", false),
      )
      .order("asc")
      .paginate({
        numItems: args.numItems,
        cursor: args.cursor,
      });

    return {
      page: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
