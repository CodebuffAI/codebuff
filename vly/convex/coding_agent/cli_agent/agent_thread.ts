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

const GEMINI_CLI_MAINTENANCE_MESSAGE = "gemini is currently under maintence.";

// Create a new agent thread
export async function createAgentThread(
  ctx: MutationCtx,
  projectId: Id<"project">,
  agentType: "Claude Code" | "Gemini CLI" | "Codex" | "Freebuff",
): Promise<Id<"agent_thread">> {
  if (agentType === "Gemini CLI") {
    throw new Error(GEMINI_CLI_MAINTENANCE_MESSAGE);
  }

  const threadId = await ctx.db.insert("agent_thread", {
    project_id: projectId,
    isProcessing: false,
    agent_type: agentType as any,
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

    if (args.agentType === "Gemini CLI") {
      throw new Error(GEMINI_CLI_MAINTENANCE_MESSAGE);
    }

    // Create new thread
    const threadId = await createAgentThread(ctx, project._id, args.agentType);

    // Set as active thread
    await ctx.db.patch(project._id, {
      active_agent_thread: threadId,
    });

    return threadId;
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
