import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  action,
  query,
  MutationCtx,
} from "!/_generated/server";
import { internal } from "!/_generated/api";
import { Id } from "!/_generated/dataModel";
import { getVerifiedAccessProject } from "../../project";
import { getAuthUser } from "../../users";

// Create a new agent thread
export async function createAgentThread(
  ctx: MutationCtx,
  projectId: Id<"project">,
  agentType: "Claude Code" | "Gemini CLI" | "Codex" | "Freebuff",
): Promise<Id<"agent_thread">> {
  void agentType;

  const threadId = await ctx.db.insert("agent_thread", {
    project_id: projectId,
    isProcessing: false,
    agent_type: "Freebuff",
    last_edited_timestamp: Date.now(),
  });

  return threadId;
}

// Get agent thread by ID (internal)
export const getAgentThread = internalQuery({
  args: {
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

// Get agent thread by ID (public query)
export const getAgentThreadPublic = query({
  args: {
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      return null;
    }

    // Verify user has access to the project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      thread.project_id,
    );

    if (!project) {
      return null;
    }

    return thread;
  },
});

// Update thread processing state
export const updateAgentThreadProcessing = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    isProcessing: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      isProcessing: args.isProcessing,
      last_edited_timestamp: Date.now(),
    });
  },
});

// Update thread workflow ID
export const updateAgentThreadWorkflowId = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    workflowId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      workflow_id: args.workflowId,
      last_edited_timestamp: Date.now(),
    });
  },
});

// Update thread title (internal version for use by other internal functions)
export const updateAgentThreadTitleInternal = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      title: args.title,
      last_edited_timestamp: Date.now(),
    });
  },
});

// Update thread active session ID
export const updateAgentThreadActiveSessionId = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
    activeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      active_session_id: args.activeSessionId,
      last_edited_timestamp: Date.now(),
    });
  },
});

// Public mutation to update thread active session ID (for rollback)
export const updateAgentThreadActiveSessionIdPublic = action({
  args: {
    threadId: v.id("agent_thread"),
    activeSessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.coding_agent.cli_agent.agent_thread
        .updateAgentThreadActiveSessionId,
      {
        threadId: args.threadId,
        activeSessionId: args.activeSessionId,
      },
    );
    return null;
  },
});

// Mark external change on thread
export const markAgentThreadExternalChange = internalMutation({
  args: {
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      last_external_change_timestamp: Date.now(),
    });
  },
});

// Create a new agent thread (public mutation)
export const createNewAgentThread = mutation({
  args: {
    projectSemanticIdentifier: v.string(),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
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
    );

    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Create new thread
    const threadId = await createAgentThread(ctx, project._id, "Freebuff");

    // Set as active thread
    await ctx.db.patch(project._id, {
      active_agent_thread: threadId,
    });

    return threadId;
  },
});

export const migrateAgentThreadsToFreebuffBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    cursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("agent_thread")
      .paginate({
        numItems: args.batchSize ?? 200,
        cursor: args.cursor ?? null,
      });

    let updated = 0;
    for (const thread of page.page) {
      if (thread.agent_type === "Freebuff") {
        continue;
      }

      updated += 1;
      if (!args.dryRun) {
        await ctx.db.patch(thread._id, {
          agent_type: "Freebuff",
          active_session_id: undefined,
          active_freebuff_run_state_storage_id: undefined,
          last_edited_timestamp: Date.now(),
        });
      }
    }

    return {
      scanned: page.page.length,
      updated,
      cursor: page.isDone ? undefined : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

type MigrateAgentThreadsBatchResult = {
  scanned: number;
  updated: number;
  cursor?: string;
  isDone: boolean;
};

type MigrateAgentThreadsResult = {
  scanned: number;
  updated: number;
  batches: number;
  isDone: boolean;
  nextCursor?: string;
};

export const migrateAllAgentThreadsToFreebuff = action({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    maxBatches: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    batches: v.number(),
    isDone: v.boolean(),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<MigrateAgentThreadsResult> => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: God role required");
    }

    let cursor: string | undefined = undefined;
    let scanned = 0;
    let updated = 0;
    let batches = 0;
    const maxBatches = args.maxBatches ?? 1000;

    while (batches < maxBatches) {
      const result: MigrateAgentThreadsBatchResult = await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_thread
          .migrateAgentThreadsToFreebuffBatch,
        {
          cursor,
          batchSize: args.batchSize,
          dryRun: args.dryRun,
        },
      );

      scanned += result.scanned;
      updated += result.updated;
      batches += 1;

      if (result.isDone) {
        return {
          scanned,
          updated,
          batches,
          isDone: true,
          nextCursor: undefined,
        };
      }

      cursor = result.cursor;
    }

    return {
      scanned,
      updated,
      batches,
      isDone: false,
      nextCursor: cursor,
    };
  },
});

// Update thread title (public mutation)
export const updateAgentThreadTitle = mutation({
  args: {
    threadId: v.id("agent_thread"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Get the thread to verify it exists
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    // Verify user has access to the project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      thread.project_id,
    );

    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Update the thread title
    await ctx.db.patch(args.threadId, {
      title: args.title,
      last_edited_timestamp: Date.now(),
    });
  },
});
