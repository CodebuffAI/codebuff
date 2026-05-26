import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
} from "./_generated/server";
import { getVerifiedAccessProject } from "./project";
import { getAuthUser } from "./users";

// update thread state
export const updateThreadState = internalMutation({
  args: {
    projectId: v.id("project"),
    state: v.string(),
    terminated: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await ctx.db.patch(args.projectId, {
      state: args.state as
        | "initializing"
        | "unassigned"
        | "active"
        | "processing",
      terminated: args.terminated,
    });
  },
});

//test

// Helper function to merge files in context and files to add, assigning importance and deduplicating
export function mergeFilesInContext(
  filesInContext: { file_path: string; importance: number }[],
  filesToAdd: string[],
) {
  // assign file priority numbers
  // baseline importance
  const highestImportance =
    (filesInContext ?? []).length > 0
      ? Math.max(...(filesInContext ?? []).map((file) => file.importance))
      : 0;

  const filesToAddWithImportance = filesToAdd.map((file, index) => {
    return {
      file_path: file,
      importance: highestImportance + index + 1,
    };
  });

  // Filter out existing files that have matching paths in filesToAdd
  const filteredFilesInContext = (filesInContext ?? []).filter(
    (existingFile) =>
      !filesToAdd.some((newFile) => newFile === existingFile.file_path),
  );

  // Combine existing and new files
  const combinedFiles = [
    ...filteredFilesInContext,
    ...filesToAddWithImportance,
  ].sort((a, b) => b.importance - a.importance);

  return combinedFiles;
}

// automatically adds a list of files to context
export const addFilesToContext = internalMutation({
  args: {
    threadId: v.id("thread"),
    filesToAdd: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    if (!thread.files_in_context) {
      thread.files_in_context = [];
    }

    // Use the helper function to merge files
    const combinedFiles = mergeFilesInContext(
      thread.files_in_context,
      args.filesToAdd,
    );

    await ctx.db.patch(args.threadId, {
      files_in_context: combinedFiles,
    });

    // return files in context
    return combinedFiles;
  },
});

export const setFilesInContext = internalMutation({
  args: {
    threadId: v.id("thread"),
    filesInContext: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      files_in_context: args.filesInContext.map((file, index) => ({
        file_path: file,
        importance: index + 1,
      })),
    });
  },
});

export const updateThreadCompaction = internalMutation({
  args: {
    threadId: v.id("thread"),
    summary: v.string(),
    upToMessageTime: v.number(),
    tokenCount: v.number(),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    await ctx.db.patch(args.threadId, {
      compacted_history_summary: args.summary,
      compacted_history_up_to_message_time: args.upToMessageTime,
      compacted_history_tokens: args.tokenCount,
      compacted_history_message_count: args.messageCount,
      compacted_history_updated_at: Date.now(),
      compaction_count: (thread.compaction_count ?? 0) + 1,
    });
  },
});

export const terminateThread = action({
  args: {
    projectSemanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.projectSemanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    await ctx.runMutation(internal.project.setStateTerminated, {
      projectId: project._id,
    });
  },
});

export const rollbackAssistantMessage = internalMutation({
  args: {
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const assistantMessage = await ctx.db.patch(args.assistantMessageId, {
      deactivated: true,
    });
    return assistantMessage;
  },
});

export const checkIfProjectTerminated = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);

    if (project && project.terminated) {
      return true;
    }
    return false;
  },
});

// gets messages from oldest to newest (in reverse order with latest messages first)
export const getProjectMessages = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_project_and_date", (q) =>
        q.eq("project_id", args.projectId),
      )
      .filter((q) => q.neq(q.field("deactivated"), true))
      .order("desc")
      .take(50);
  },
});

export const createNewThreadMain = mutation({
  args: {
    projectSemanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // authenticate
    const user = await getAuthUser(ctx);

    if (!user) {
      throw new Error("User not found");
    }

    // authorize
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.projectSemanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    // create thread
    const threadId = await createNewThread(ctx, project._id);
    return threadId;
  },
});

export const createNewThreadFromEntryPoint = mutation({
  args: {
    projectSemanticIdentifier: v.string(),
    entryPointId: v.id("entry_point"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    if (!user) {
      throw new Error("User not found");
    }

    // authorize
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.projectSemanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    // get entry point
    const entryPoint = await ctx.db.get(args.entryPointId);
    if (!entryPoint) {
      throw new Error("Entry point not found");
    }

    // get associated files
    const associatedFiles = entryPoint.associated_files;

    // create new thread
    const thread = await ctx.db.insert("thread", {
      project: project._id,
      entry_point: args.entryPointId,
      status: "active",
      files_in_context: associatedFiles.map((file) => ({
        file_path: file,
        importance: -1,
      })),
    });

    await ctx.db.patch(project._id, {
      active_thread: thread,
      active_agent_thread: undefined, // Clear agent thread to switch to old chat UI
    });

    return thread;
  },
});

export async function createNewThread(
  ctx: MutationCtx,
  projectId: Id<"project">,
) {
  // Start with empty files in context
  const filesInContext: { file_path: string; importance: number }[] = [];

  const thread = await ctx.db.insert("thread", {
    project: projectId,
    status: "active",
    files_in_context: filesInContext,
  });

  await ctx.db.patch(projectId, {
    active_thread: thread,
    active_agent_thread: undefined, // Clear agent thread to switch to old chat UI
  });

  return thread;
}

export const getThread = internalQuery({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const getProjectThreads = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("thread")
      .withIndex("by_project_by_entry_point", (q) =>
        q.eq("project", args.projectId),
      )
      .order("desc")
      .collect();
  },
});

export const getFirstMessageInThread = internalQuery({
  args: {
    threadId: v.id("thread"),
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.threadId).eq("streaming", false),
      )
      .order("asc")
      .filter((q) => q.neq(q.field("deactivated"), true))
      .first();
  },
});

export const setThreadTitle = internalMutation({
  args: {
    threadId: v.id("thread"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      title: args.title,
    });
  },
});

export const addIntegrationIdToContext = internalMutation({
  args: {
    threadId: v.id("thread"),
    integrationReferenceId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the thread
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    // Find the integration by name
    const integration = await ctx.db
      .query("integration")
      .withIndex("by_reference_id", (q) =>
        q.eq("reference_id", args.integrationReferenceId),
      )
      .first();
    if (!integration) throw new Error("Integration not found");

    // Get current integrations in context
    const currentIntegrations = thread.integrations_in_context ?? [];

    // Check if integration already exists in context
    const existingIndex = currentIntegrations.indexOf(integration._id);

    let newIntegrations;
    if (existingIndex !== -1) {
      // If integration exists, move it to the end
      newIntegrations = [
        ...currentIntegrations.slice(0, existingIndex),
        ...currentIntegrations.slice(existingIndex + 1),
        integration._id,
      ];
    } else {
      // If integration doesn't exist, add it to the end
      newIntegrations = [...currentIntegrations, integration._id];

      // If we have more than 3 integrations, remove the first one
      if (newIntegrations.length > 3) {
        newIntegrations = newIntegrations.slice(-3);
      }
    }

    // Update thread with new integrations
    await ctx.db.patch(args.threadId, {
      integrations_in_context: newIntegrations,
    });

    return integration;
  },
});

export const addIntegrationNameToContextPublic = mutation({
  args: {
    semanticIdentifier: v.string(),
    threadId: v.id("thread"),
    referenceId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // auth check on the project id
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    await ctx.runMutation(internal.thread.addIntegrationIdToContext, {
      threadId: args.threadId,
      integrationReferenceId: args.referenceId,
    });
  },
});

export const updateThreadTitle = mutation({
  args: {
    semanticIdentifier: v.string(),
    threadId: v.id("thread"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // auth check on the project id
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    // verify the thread belongs to this project
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.project !== project._id) {
      throw new Error("Thread not found or access denied");
    }

    await ctx.runMutation(internal.thread.setThreadTitle, {
      threadId: args.threadId,
      title: args.title,
    });
  },
});

export const deleteThread = mutation({
  args: {
    semanticIdentifier: v.string(),
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    console.log("[deleteThread] Starting deletion", {
      semanticIdentifier: args.semanticIdentifier,
      threadId: args.threadId,
    });

    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // auth check on the project id
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    console.log("[deleteThread] Project found", {
      projectId: project._id,
      activeThread: project.active_thread,
    });

    // verify the thread belongs to this project
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }
    if (thread.project !== project._id) {
      throw new Error("Thread does not belong to this project");
    }

    console.log("[deleteThread] Thread verified", {
      threadId: thread._id,
      isActiveThread: project.active_thread === args.threadId,
    });

    // If this is the active thread, switch to another thread or create a new one
    const isActiveThread = project.active_thread === args.threadId;
    console.log("[deleteThread] Is active thread?", {
      isActiveThread,
      activeThreadId: project.active_thread,
      deletingThreadId: args.threadId,
      match: project.active_thread === args.threadId,
    });

    if (isActiveThread) {
      console.log(
        "[deleteThread] Active thread being deleted, finding replacement",
      );

      // Find another thread in the project (excluding the one we're deleting)
      const allThreads = await ctx.db
        .query("thread")
        .withIndex("by_project_by_entry_point", (q) =>
          q.eq("project", project._id),
        )
        .collect();

      console.log("[deleteThread] All threads found", {
        totalThreads: allThreads.length,
        threadIds: allThreads.map((t) => t._id),
        deletingThreadId: args.threadId,
      });

      const otherThread = allThreads.find((t) => t._id !== args.threadId);

      if (otherThread) {
        console.log("[deleteThread] Switching to other thread", {
          newActiveThread: otherThread._id,
        });
        // Switch to another thread BEFORE deleting
        await ctx.db.patch(project._id, {
          active_thread: otherThread._id,
        });
        console.log("[deleteThread] Active thread updated");
      } else {
        console.log("[deleteThread] No other threads, creating new one");
        // No other threads, create a new one BEFORE deleting
        const newThreadId = await createNewThread(ctx, project._id);
        console.log("[deleteThread] New thread created", {
          newThreadId,
        });
        await ctx.db.patch(project._id, {
          active_thread: newThreadId,
        });
        console.log("[deleteThread] Active thread set to new thread");
      }
    }

    // Delete the thread
    console.log("[deleteThread] Deleting thread", args.threadId);
    try {
      await ctx.db.delete(args.threadId);
      console.log("[deleteThread] Thread deleted successfully");
    } catch (error) {
      console.error("[deleteThread] Error deleting thread:", error);
      throw error;
    }

    return { success: true };
  },
});

export const markExternalChange = internalMutation({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      latest_external_change_timestamp: Date.now(),
    });
  },
});

// Internal cacheable version - accepts projectId and activeThread directly
export const getLatestExternalChangeTimestampInternal = internalQuery({
  args: {
    projectId: v.id("project"),
    activeThread: v.optional(v.id("thread")),
  },
  handler: async (ctx, args) => {
    if (!args.activeThread) {
      return null;
    }

    const thread = await ctx.db.get(args.activeThread);
    return thread?.latest_external_change_timestamp ?? null;
  },
});

export const getLatestExternalChangeTimestamp = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<number | null> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      return null;
    }

    // Delegate to internal cached version
    return await ctx.runQuery(
      internal.thread.getLatestExternalChangeTimestampInternal,
      {
        projectId: project._id,
        activeThread: project.active_thread,
      },
    );
  },
});

export const getActiveThreadCompactionStatusInternal = internalQuery({
  args: {
    activeThread: v.optional(v.id("thread")),
  },
  handler: async (ctx, args) => {
    if (!args.activeThread) {
      return null;
    }

    const thread = await ctx.db.get(args.activeThread);
    if (!thread) {
      return null;
    }

    return {
      compactionCount: thread.compaction_count ?? 0,
      compactedHistoryUpdatedAt: thread.compacted_history_updated_at ?? null,
      compactedHistoryTokens: thread.compacted_history_tokens ?? null,
      compactedHistoryMessageCount:
        thread.compacted_history_message_count ?? null,
    };
  },
});

export const getActiveThreadCompactionStatus = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    compactionCount: number;
    compactedHistoryUpdatedAt: number | null;
    compactedHistoryTokens: number | null;
    compactedHistoryMessageCount: number | null;
  } | null> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) {
      return null;
    }

    return await ctx.runQuery(
      internal.thread.getActiveThreadCompactionStatusInternal,
      {
        activeThread: project.active_thread,
      },
    );
  },
});
