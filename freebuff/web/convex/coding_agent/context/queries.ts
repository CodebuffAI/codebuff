import { internalQuery } from "!/_generated/server";
import { v } from "convex/values";
import {
  ContextMember,
  ContextMessage,
  ContextProjectIntegration,
} from "./types";

const MAX_PROJECT_MEMBERS = 50;
const MAX_CONTEXT_MESSAGES = 160;
const MAX_ENTRY_POINTS = 200;
const MAX_PROJECT_INTEGRATIONS = 50;

function serializeContextMember(user: any): ContextMember {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
  };
}

function serializeContextMessage(message: any): ContextMessage {
  return {
    _id: message._id,
    _creationTime: message._creationTime,
    role: message.role,
    content: message.content,
    date: message.date,
    thread_id: message.thread_id,
    images: message.images,
    object: message.object,
    result: message.result,
    summarization: message.summarization,
    compact_summarization: message.compact_summarization,
    code_summarization: message.code_summarization,
    tool_call: message.tool_call,
    error_check: message.error_check,
    file_apply_results: message.file_apply_results,
    core_message: message.core_message,
    pageContext: message.pageContext,
  };
}

function serializeProjectIntegration(
  integration: any,
): ContextProjectIntegration {
  return {
    _id: integration._id,
    title: integration.title,
    description: integration.description,
    env_variables: integration.env_variables,
  };
}

// get the following:
// CACHE-OPTIMIZED: Takes projectId instead of full document to enable caching
export const getContextData = internalQuery({
  args: {
    projectId: v.id("project"),
    maxMessages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Fetch project document
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found: " + args.projectId);
    }

    // members
    const projectMembers = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .take(MAX_PROJECT_MEMBERS);

    const members = (
      await Promise.all(
        projectMembers.map(async (member) => {
          const user = await ctx.db.get(member.user);
          return user ? serializeContextMember(user) : null;
        }),
      )
    ).filter(
      (user): user is ContextMember => user !== undefined && user !== null,
    );

    // thread
    const thread = project.active_thread
      ? await ctx.db.get(project.active_thread)
      : null;

    if (!thread) {
      throw new Error("Thread not found in project " + args.projectId);
    }

    const messageCap = Math.min(
      Math.max(1, args.maxMessages ?? MAX_CONTEXT_MESSAGES),
      MAX_CONTEXT_MESSAGES,
    );

    // messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", project.active_thread).eq("streaming", false),
      )
      .order("desc")
      .filter((q) => q.neq(q.field("deactivated"), true))
      .filter((q) => q.neq(q.field("isFastReturn"), true))
      .filter((q) => q.neq(q.field("exclude_from_agent_history"), true))
      .take(messageCap);
    const serializedMessages = messages.map(serializeContextMessage);

    // entry points
    const entryPoints = await ctx.db
      .query("entry_point")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .take(MAX_ENTRY_POINTS);

    // Get project integrations
    const projectIntegrationRelations = await ctx.db
      .query("project_integration")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(MAX_PROJECT_INTEGRATIONS);

    // Get the actual integration documents
    const projectIntegrations = [];
    for (const pi of projectIntegrationRelations) {
      const integration = await ctx.db.get(pi.integrationId);
      if (integration !== null && integration !== undefined) {
        projectIntegrations.push(serializeProjectIntegration(integration));
      }
    }

    // Find project owner (owner role, for credit tracking)
    const projectOwner = projectMembers.find(
      (member) => member.project_role === "owner",
    );

    if (!projectOwner) {
      // Fallback: if no owner role, try admin role
      const adminMember = projectMembers.find(
        (member) => member.project_role === "admin",
      );

      if (!adminMember) {
        // Fallback: if no owner or admin, use the first member
        const firstMember = projectMembers[0];
        if (!firstMember) {
          throw new Error(
            "No project members found for project " + args.projectId,
          );
        }
        return {
          members,
          projectOwnerId: firstMember.user,
          thread,
          messages: serializedMessages,
          entryPoints,
          projectIntegrations,
        };
      }
      return {
        members,
        projectOwnerId: adminMember.user,
        thread,
        messages: serializedMessages,
        entryPoints,
        projectIntegrations,
      };
    }

    return {
      members,
      projectOwnerId: projectOwner.user,
      thread,
      messages: serializedMessages,
      entryPoints,
      projectIntegrations,
    };
  },
});
