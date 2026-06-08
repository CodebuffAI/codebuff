import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  getOrganizationContext,
  verifyOrganizationAccess,
  logSecurityAction,
} from "./org_security";
import { OrgPermission } from "./schema";
import {
  ActionCtx,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { getAuthUser } from "./users";
import { allProjects, projectsByDay } from "./aggregates/admin_aggregates";

function serializeThreadMessage(message: Doc<"messages">) {
  return {
    _id: message._id,
    _creationTime: message._creationTime,
    project_id: message.project_id,
    thread_id: message.thread_id,
    role: message.role,
    content: message.content,
    date: message.date,
    streaming: message.streaming,
    isFastReturn: message.isFastReturn,
    images: message.images,
    object: message.object,
    result: message.result,
    tool_call: message.tool_call,
    thinking: message.thinking,
    error_check: message.error_check,
    file_apply_results: message.file_apply_results,
    core_message: message.core_message,
    fast_return_preview: message.fast_return_preview,
    token_usage: message.token_usage,
    credits_deducted: message.credits_deducted,
    total_cost_usd: message.total_cost_usd,
    usage_breakdown: message.usage_breakdown,
    model_semantic_name: message.model_semantic_name,
    commit_hash: message.commit_hash,
    deactivated: message.deactivated,
    suggestions: message.suggestions,
    message_state: message.message_state,
    integration_references: message.integration_references,
  };
}

/** Slimmer payload for live chat subscriptions (omits assistant core_message — UI uses content). */
function serializeThreadMessageForClientList(message: Doc<"messages">) {
  const full = serializeThreadMessage(message);
  if (message.role === "assistant") {
    const { core_message: _omit, ...rest } = full;
    return rest;
  }
  return full;
}

/**
 * Lightweight serializer for list subscriptions — strips heavy fields
 * (thinking, object, result, error_check, tool_call, token_usage, etc.)
 * to cut per-message payload from ~250KB to ~10-20KB.
 * Frontend lazy-loads heavy fields via getMessageExecutionDetails on expand.
 */
function serializeThreadMessageLight(message: Doc<"messages">) {
  return {
    _id: message._id,
    _creationTime: message._creationTime,
    project_id: message.project_id,
    thread_id: message.thread_id,
    role: message.role,
    content: message.content,
    date: message.date,
    streaming: message.streaming,
    isFastReturn: message.isFastReturn,
    images: message.images,
    core_message: message.role === "user" ? message.core_message : undefined,
    fast_return_preview: message.fast_return_preview,
    model_semantic_name: message.model_semantic_name,
    commit_hash: message.commit_hash,
    deactivated: message.deactivated,
    suggestions: message.suggestions,
    message_state: message.message_state,
    integration_references: message.integration_references,
    has_thinking: !!message.thinking,
    has_execution_details: !!(
      message.tool_call?.trim() ||
      message.error_check?.trim() ||
      message.result?.trim() ||
      (message.object?.trim() &&
        message.object !== "[]" &&
        message.object !== "{}")
    ),
    has_usage: !!(
      message.token_usage ||
      message.usage_breakdown ||
      (message.credits_deducted !== undefined &&
        message.credits_deducted > 0) ||
      message.total_cost_usd
    ),
  };
}

type ThreadMessageForClient = ReturnType<
  typeof serializeThreadMessageForClientList
>;

type ThreadMessageForClientLight = ReturnType<
  typeof serializeThreadMessageLight
>;

type DaytonaServer = "legacy" | "new";
type MigrationStatus =
  | "idle"
  | "queued"
  | "copying"
  | "validating"
  | "cutting_over"
  | "done"
  | "failed";

type ProjectWithDaytonaMigration = Doc<"project"> & {
  daytona_server?: DaytonaServer;
  migration_status?: MigrationStatus;
  migration_error?: string;
  legacy_sandbox_id?: string;
  migration_target_sandbox_id?: string;
  migration_started_at?: number;
  migration_completed_at?: number;
};

async function getProjectDaytonaMigrationByProjectId(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"project">,
) {
  return await ctx.db
    .query("daytona_migration")
    .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
    .unique();
}

async function attachDaytonaMigrationFields(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"project">,
): Promise<ProjectWithDaytonaMigration> {
  const migration = await getProjectDaytonaMigrationByProjectId(ctx, project._id);
  if (!migration) {
    return project as ProjectWithDaytonaMigration;
  }

  return {
    ...project,
    daytona_server: migration.daytona_server,
    migration_status: migration.migration_status,
    migration_error: migration.migration_error,
    legacy_sandbox_id: migration.legacy_sandbox_id,
    migration_target_sandbox_id: migration.migration_target_sandbox_id,
    migration_started_at: migration.migration_started_at,
    migration_completed_at: migration.migration_completed_at,
  };
}

async function upsertProjectDaytonaMigration(
  ctx: MutationCtx,
  projectId: Id<"project">,
  patch: {
    daytona_server?: DaytonaServer;
    migration_status?: MigrationStatus;
    migration_error?: string;
    legacy_sandbox_id?: string;
    migration_target_sandbox_id?: string;
    migration_started_at?: number;
    migration_completed_at?: number;
    updated_at?: number;
  },
): Promise<void> {
  const existing = await getProjectDaytonaMigrationByProjectId(ctx, projectId);
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("daytona_migration", {
    project_id: projectId,
    ...patch,
  });
}

export const getProjectDaytonaMigration = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await getProjectDaytonaMigrationByProjectId(ctx, args.projectId);
  },
});

// Internal cacheable version - accepts userId to avoid JWT lookup on every call
export const getProjectDataInternal = internalQuery({
  args: {
    semanticIdentifier: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const projectData = await getVerifiedAccessProject(
      ctx,
      args.userId,
      args.semanticIdentifier,
    );

    if (!projectData) {
      return null;
    }

    return await attachDaytonaMigrationFields(ctx, projectData);
  },
});

// client side - main project data only
export const getProjectData = query({
  // Validators for arguments.
  args: {
    semanticIdentifier: v.string(),
  },

  // Query implementation.
  handler: async (ctx, args): Promise<ProjectWithDaytonaMigration | null> => {
    // verify user
    const user = await getAuthUser(ctx);

    if (!user) {
      return null;
    }

    // Delegate to internal cached version
    return await ctx.runQuery(internal.project.getProjectDataInternal, {
      semanticIdentifier: args.semanticIdentifier,
      userId: user._id,
    });
  },
});

// client side - main project data only
export const getProjectDataById = query({
  // Validators for arguments.
  args: {
    projectId: v.id("project"),
  },

  // Query implementation.
  handler: async (ctx, args) => {
    // verify user
    const user = await getAuthUser(ctx);

    if (!user) {
      return null;
    }

    const projectData = await ctx.db.get(args.projectId);

    if (!projectData) {
      return null;
    }

    return await attachDaytonaMigrationFields(ctx, projectData);
  },
});

// Get thread messages for a project by semantic identifier
export const getThreadMessages = query({
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

    if (!projectData.active_thread) {
      return [];
    }

    // PERFORMANCE FIX: Use by_thread index to avoid scanning all messages
    // Instead, we return ALL messages (including rare deactivated ones)
    // The client filters out deactivated messages after receiving results
    // This reduces document reads from potentially thousands to just 60
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", projectData.active_thread).eq("streaming", false),
      )
      .order("desc")
      .take(60);

    return messages.map(serializeThreadMessageLight);
  },
});

// Internal cacheable version for verified project lookup
// Pagination must stay in main query, but we can cache the project verification
export const getVerifiedProjectForMessagesInternal = internalQuery({
  args: {
    semanticIdentifier: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getVerifiedAccessProject(
      ctx,
      args.userId,
      args.semanticIdentifier,
    );
  },
});

// Paginated thread messages for infinite scroll
export const listThreadMessages = query({
  args: {
    semanticIdentifier: v.string(),
    threadId: v.optional(v.id("thread")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: null } as any;
    }

    // Delegate project verification to internal cached version
    const projectData = await ctx.runQuery(
      internal.project.getVerifiedProjectForMessagesInternal,
      {
        semanticIdentifier: args.semanticIdentifier,
        userId: user._id,
      },
    );

    if (!projectData) {
      return { page: [], isDone: true, continueCursor: null } as any;
    }

    // Use provided threadId or fall back to project's active_thread
    const threadId = args.threadId ?? projectData.active_thread;

    if (!threadId) {
      return { page: [], isDone: true, continueCursor: null } as any;
    }

    // NOTE: Pagination must stay in the main query (cannot delegate to internal query)
    // because Convex cursors are bound to the specific query function
    try {
      // PERFORMANCE FIX: Use by_thread index (thread_id + streaming only)
      // This matches the query exactly, avoiding scanning 3000+ documents
      // The client filters out deactivated messages after receiving the page
      // This reduces document reads from ~3,061 to ~10-100 (page size)
      const page = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) =>
          q.eq("thread_id", threadId).eq("streaming", false),
        )
        .order("desc")
        .paginate(args.paginationOpts);

      return {
        ...page,
        page: page.page.map(serializeThreadMessageLight),
      };
    } catch (error: any) {
      // Handle invalid cursor errors gracefully by returning empty results
      // This allows the frontend to restart pagination from the beginning
      if (error?.message?.includes("InvalidCursor")) {
        console.warn(
          `Invalid cursor for thread ${threadId}, resetting pagination`,
        );
        return { page: [], isDone: true, continueCursor: null } as any;
      }
      throw error;
    }
  },
});

// Lazy-loaded heavy fields for a single message.
// Called by frontend when user expands thinking/execution details/usage.
export const getMessageExecutionDetails = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    return {
      _id: message._id,
      thinking: message.thinking,
      object: message.object,
      result: message.result,
      error_check: message.error_check,
      tool_call: message.tool_call,
      file_apply_results: message.file_apply_results,
      token_usage: message.token_usage,
      credits_deducted: message.credits_deducted,
      total_cost_usd: message.total_cost_usd,
      usage_breakdown: message.usage_breakdown,
    };
  },
});

// Internal query to get ALL thread messages including deactivated ones
// Used for operations like undo/revert that need complete message history
export const getAllThreadMessages = internalQuery({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    // Get ALL messages including deactivated ones
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.threadId).eq("streaming", false),
      )
      .order("asc")
      .collect();

    return messages;
  },
});

// Internal cacheable version - accepts projectId and activeThread directly to avoid auth overhead
export const getStreamedMessagesInternal = internalQuery({
  args: {
    projectId: v.id("project"),
    activeThread: v.optional(v.id("thread")),
  },
  handler: async (ctx, args) => {
    if (!args.activeThread) {
      return [];
    }

    // PERFORMANCE FIX: Removed .filter() to avoid scanning messages
    // Streamed messages are always recent (max 2), so deactivated filtering
    // can be done client-side if needed. This improves query performance.
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.activeThread).eq("streaming", true),
      )
      .order("desc")
      .take(2);

    return messages;
  },
});

// Internal cacheable version for verified project lookup
// Must stay separate from getStreamedMessagesInternal to allow caching of verification
export const getVerifiedProjectForStreamedMessagesInternal = internalQuery({
  args: {
    semanticIdentifier: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getVerifiedAccessProject(
      ctx,
      args.userId,
      args.semanticIdentifier,
    );
  },
});

// Get streamed messages for a project by semantic identifier
export const getStreamedMessages = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<ThreadMessageForClientLight[]> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    // Delegate project verification to internal cached version
    const projectData = await ctx.runQuery(
      internal.project.getVerifiedProjectForStreamedMessagesInternal,
      {
        semanticIdentifier: args.semanticIdentifier,
        userId: user._id,
      },
    );

    if (!projectData) {
      return [];
    }

    // Delegate to internal cached version to avoid redundant auth checks on subsequent calls
    const messages = await ctx.runQuery(
      internal.project.getStreamedMessagesInternal,
      {
        projectId: projectData._id,
        activeThread: projectData.active_thread,
      },
    );
    return messages.map(serializeThreadMessageLight);
  },
});

// Internal cacheable version - accepts userId to avoid JWT lookup
export const getEntryPointsInternal = internalQuery({
  args: {
    semanticIdentifier: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const projectData = await getVerifiedAccessProject(
      ctx,
      args.userId,
      args.semanticIdentifier,
    );

    if (!projectData) {
      return [];
    }

    const entryPoints = await ctx.db
      .query("entry_point")
      .withIndex("by_project", (q) => q.eq("project", projectData._id))
      .collect();

    return entryPoints;
  },
});

// Get entry points for a project by semantic identifier
export const getEntryPoints = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"entry_point">[]> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    // Delegate to internal cached version
    return await ctx.runQuery(internal.project.getEntryPointsInternal, {
      semanticIdentifier: args.semanticIdentifier,
      userId: user._id,
    });
  },
});

/**
 * Verify that the user has access to the project
 */
export async function getVerifiedAccessProject(
  ctx: QueryCtx | ActionCtx,
  userId: Id<"users">,
  projectSemanticIdentifier?: string,
  projectId?: Id<"project">,
  requiredPermission: OrgPermission = "read",
  user?: Doc<"users"> | null,
): Promise<Doc<"project"> | null> {
  let project: Doc<"project"> | null = null;
  if (projectId) {
    project = await ctx.runQuery(internal.project.getProject, { projectId });
  } else if (projectSemanticIdentifier) {
    project = await ctx.runQuery(internal.project.getProjectFromIdentifier, {
      semanticIdentifier: projectSemanticIdentifier,
    });
  }
  if (!project) {
    return null;
  }

  // Only fetch user if not already provided
  if (!user) {
    user = await ctx.runQuery(internal.users.get, {
      userId,
    });
  }

  if (!user) {
    return null;
  }

  // godmode can access all projects (even deleted ones for recovery)
  if (user.role === "god") {
    return project;
  }

  // Filter out deleted projects for non-god users
  if (project.deleted) {
    return null;
  }

  // For organization-owned projects, verify organization membership
  if (project.organization_id) {
    // SECURITY FIX: Verify organization membership through JWT token
    const hasOrgAccess = await verifyOrganizationAccess(
      ctx,
      project.organization_id,
      requiredPermission,
    );

    if (hasOrgAccess) {
      return project;
    }

    // Fallback: Check individual project membership for org projects
    const isMember: boolean = await ctx.runQuery(
      internal.project.isUserMemberOfProject,
      { projectId: project._id, userId },
    );

    if (isMember) {
      return project;
    }

    // Log only denied access attempts for security monitoring
    await logSecurityAction(
      ctx,
      "project_access_denied",
      `project:${project._id}`,
      false,
      {
        reason: "not_organization_member",
        organizationId: project.organization_id,
      },
    );
    return null;
  }

  // For personal projects, check project membership
  const isMember: boolean = await ctx.runQuery(
    internal.project.isUserMemberOfProject,
    { projectId: project._id, userId },
  );

  if (!isMember) {
    // Log only denied access attempts for security monitoring
    await logSecurityAction(
      ctx,
      "project_access_denied",
      `project:${project._id}`,
      false,
      {
        reason: "not_project_member",
      },
    );
    return null;
  }

  return project;
}

export const isUserMemberOfProject = internalQuery({
  args: {
    projectId: v.id("project"),
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", args.userId),
      )
      .first();
    return !!projectMember;
  },
});

export const getProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },

  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }
    return await attachDaytonaMigrationFields(ctx, project);
  },
});

export const setProjectSpec = internalMutation({
  args: {
    projectId: v.id("project"),
    spec: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { spec: args.spec });
  },
});

export const setPrettyPreviewUrl = internalMutation({
  args: {
    projectId: v.id("project"),
    prettyPreviewUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      pretty_preview_url: args.prettyPreviewUrl,
    });
  },
});

/**
 * Update project's Convex URL (used during self-hosting migration)
 */
export const updateProjectConvexUrl = internalMutation({
  args: {
    projectId: v.id("project"),
    convexUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      convex_url: args.convexUrl,
    });
  },
});

/**
 * Get project data by project ID
 */
// Internal cacheable version - accepts userId instead of calling getAuthUser
export const getProjectByIdInternal = internalQuery({
  args: {
    projectId: v.id("project"),
    userId: v.id("users"),
    userRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify user has access to the project
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", args.userId),
      )
      .first();

    if (!projectMember) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    // Filter out deleted projects (unless user is god mode)
    if (project.deleted && args.userRole !== "god") return null;

    return {
      _id: project._id,
      name: project.name,
      semantic_identifier: project.semantic_identifier,
      github_url: project.github_url,
      pretty_preview_url: project.pretty_preview_url,
      last_opened: project.last_opened,
      _creationTime: project._creationTime,
    };
  },
});

export const getProjectById = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    _id: Id<"project">;
    name?: string;
    semantic_identifier: string;
    github_url?: string;
    pretty_preview_url?: string;
    last_opened?: number;
    _creationTime: number;
  } | null> => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    return await ctx.runQuery(internal.project.getProjectByIdInternal, {
      projectId: args.projectId,
      userId: user._id,
      userRole: user.role,
    });
  },
});

export const getProjectFromIdentifier = internalQuery({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const project: Doc<"project"> | null = await ctx.db
      .query("project")
      .withIndex("by_semantic_identifier", (q) =>
        q.eq("semantic_identifier", args.semanticIdentifier),
      )
      .unique();

    if (!project) {
      return null;
    }

    return await attachDaytonaMigrationFields(ctx, project);
  },
});

export const getUserProjects = query({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    // SECURITY FIX: Get organization context from JWT token instead of client
    // Fetch this ONCE to avoid duplicate JWT validations
    const orgContext = await getOrganizationContext(ctx);

    // Get all project memberships for the user
    const projectMembers = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", user._id))
      .collect();

    // Get all projects with screenshot URLs
    const projects = await Promise.all(
      projectMembers.map(async (pm) => {
        const project = await ctx.db.get(pm.project);
        if (!project) return null;

        // Filter out deleted projects
        if (project.deleted) return null;

        // SECURITY FIX: Filter by verified organization context
        if (orgContext?.organizationId) {
          // In organization workspace - only show org projects user has access to
          if (project.organization_id !== orgContext.organizationId) {
            return null;
          }

          // Verify user has access to this organization project
          // Pass orgContext to avoid re-fetching it (optimization)
          if (project.organization_id) {
            const hasAccess = await verifyOrganizationAccess(
              ctx,
              project.organization_id,
              "read",
              orgContext, // Pass pre-fetched context
            );
            if (!hasAccess) {
              return null;
            }
          }
        } else {
          // In personal workspace - only show personal projects (no organization_id)
          if (project.organization_id) {
            return null;
          }
        }

        // Get screenshot URL if storage ID exists
        let screenshotUrl = null;
        if (project.screenshot_r2_url) {
          screenshotUrl = project.screenshot_r2_url;
        }

        return {
          ...project,
          screenshotUrl,
        };
      }),
    );

    // Filter out null projects and sort by last_opened
    return projects
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => {
        const aTime = a.last_opened ?? 0;
        const bTime = b.last_opened ?? 0;
        return bTime - aTime;
      });
  },
});

export const updateProjectCustomInstructions = mutation({
  args: {
    projectId: v.id("project"),
    customInstructions: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify user has proper access to project (including organization validation)
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
      "write", // Require write permission for updating
      user,
    );

    if (!project) {
      throw new Error("Access denied");
    }

    // Additional check: Only allow project members to update custom instructions
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (!projectMember && user.role !== "god") {
      throw new Error("Access denied");
    }

    // Update the project's custom instructions
    await ctx.db.patch(args.projectId, {
      custom_instructions: args.customInstructions,
    });

    return { success: true };
  },
});

export const getProjectMembers = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify user has access to project
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // Filter out deleted projects (unless user is god mode)
    if (project.deleted && user.role !== "god") {
      throw new Error("Project not found");
    }

    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (!projectMember && user.role !== "god") {
      throw new Error("Access denied");
    }

    // Get all project members with their user info
    const members = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();

    const membersWithInfo = await Promise.all(
      members.map(async (member) => {
        const userInfo = await ctx.db.get(member.user);
        return {
          ...member,
          userInfo,
        };
      }),
    );

    return membersWithInfo;
  },
});

/**
 * Internal version of getProjectMembers for use in actions
 * Does not require authentication - used for checking limits
 */
export const getProjectMembersInternal = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    // Get all project members
    const members = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();

    return members;
  },
});

export const transferProjectOwnershipInternal = internalMutation({
  args: {
    projectId: v.id("project"),
    newOwnerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const memberships = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();

    const currentOwnerMemberships = memberships.filter(
      (membership) => membership.project_role === "owner",
    );
    const existingTargetMembership = memberships.find(
      (membership) => membership.user === args.newOwnerUserId,
    );

    let targetMembershipId = existingTargetMembership?._id;

    if (!targetMembershipId) {
      targetMembershipId = await ctx.db.insert("project_member", {
        project: args.projectId,
        user: args.newOwnerUserId,
        project_role: "owner",
      });
    }

    for (const membership of currentOwnerMemberships) {
      if (membership.user === args.newOwnerUserId) {
        continue;
      }

      await ctx.db.patch(membership._id, {
        project_role: "member",
      });
    }

    if (existingTargetMembership?.project_role !== "owner") {
      await ctx.db.patch(targetMembershipId, {
        project_role: "owner",
      });
    }

    return {
      success: true,
      projectId: args.projectId,
      newOwnerUserId: args.newOwnerUserId,
      createdMembership: !existingTargetMembership,
    };
  },
});

export const removeProjectMember = mutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify user has admin access to project
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const requesterMembership = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .filter((q) =>
        q.or(
          q.eq(q.field("project_role"), "admin"),
          q.eq(q.field("project_role"), "owner"),
        ),
      )
      .first();

    const hasPlatformAdminAccess = user.role === "god" || user.role === "admin";

    if (!requesterMembership && !hasPlatformAdminAccess) {
      throw new Error("Not authorized to remove members");
    }

    // Don't allow removing the owner
    const memberToRemove = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", args.userId),
      )
      .first();

    if (!memberToRemove) throw new Error("Member not found");
    if (memberToRemove.project_role === "owner") {
      throw new Error("Cannot remove project owner");
    }

    await ctx.db.delete(memberToRemove._id);
  },
});

export const transferProjectOwnership = mutation({
  args: {
    projectId: v.id("project"),
    newOwnerUserId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    projectId: Id<"project">;
    newOwnerUserId: Id<"users">;
    createdMembership: boolean;
  }> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const requesterMembership = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    const hasPlatformAdminAccess = user.role === "god" || user.role === "admin";

    if (
      !hasPlatformAdminAccess &&
      requesterMembership?.project_role !== "owner"
    ) {
      throw new Error("Not authorized to transfer ownership");
    }

    return await ctx.runMutation(
      internal.project.transferProjectOwnershipInternal,
      {
        projectId: args.projectId,
        newOwnerUserId: args.newOwnerUserId,
      },
    );
  },
});

export const setStateProcessing = internalMutation({
  args: {
    projectId: v.id("project"),
    activeWorkflowId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.projectId, {
      terminated: false,
      state: "processing",
      active_workflow_id: args.activeWorkflowId,
    });
  },
});

export const setStateTerminated = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.projectId, {
      terminated: true,
      state: "active",
    });
  },
});

export const setStateDone = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.projectId, {
      terminated: false,
      state: "active",
      active_workflow_id: undefined,
    });
  },
});

export const setActiveThread = mutation({
  args: {
    projectId: v.id("project"),
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.projectId, {
      active_thread: args.threadId,
      active_agent_thread: undefined, // Clear agent thread to switch to old chat UI
    });
  },
});

// Set active agent thread (for new agent-based system)
export const setActiveAgentThread = mutation({
  args: {
    projectId: v.id("project"),
    threadId: v.id("agent_thread"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify user has access to project
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Verify user has access (check project_member)
    const membership = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .filter((q) => q.eq(q.field("user"), user._id))
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    return await ctx.db.patch(args.projectId, {
      active_agent_thread: args.threadId,
      active_thread: undefined, // Clear old thread to switch to new chat UI
    });
  },
});

export const setProdDeploymentSlug = mutation({
  args: {
    projectId: v.id("project"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.projectId, {
      prod_deployment_slug: args.slug,
    });
  },
});

// Internal cacheable version - accepts userRole to avoid JWT lookup
export const getProdDeploymentSlugInternal = internalQuery({
  args: {
    projectId: v.id("project"),
    userRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // Filter out deleted projects (unless user is god mode)
    if (project.deleted && args.userRole !== "god") {
      throw new Error("Project not found");
    }

    return project.prod_deployment_slug;
  },
});

export const getProdDeploymentSlug = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<string | undefined | null> => {
    const user = await getAuthUser(ctx);

    // Delegate to internal cached version
    return await ctx.runQuery(internal.project.getProdDeploymentSlugInternal, {
      projectId: args.projectId,
      userRole: user?.role,
    });
  },
});

// Internal cacheable version - accepts userRole instead of calling getAuthUser
export const getProjectDomainsInternal = internalQuery({
  args: {
    projectId: v.id("project"),
    userRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // Filter out deleted projects (unless user is god mode)
    if (project.deleted && args.userRole !== "god") {
      throw new Error("Project not found");
    }

    const domains = await ctx.db
      .query("project_domain")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return (
      await Promise.all(
        domains
          .map((domain) => domain.domainId)
          .map((domainId) => ctx.db.get(domainId)),
      )
    ).filter((d) => d !== null);
  },
});

export const getProjectDomains = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<Doc<"domain">[]> => {
    const user = await getAuthUser(ctx);

    return await ctx.runQuery(internal.project.getProjectDomainsInternal, {
      projectId: args.projectId,
      userRole: user?.role,
    });
  },
});

export const getActiveProjectDomains = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<Doc<"domain">[]> => {
    const user = await getAuthUser(ctx);

    // Call internal version directly to avoid double auth check
    const projectDomains = await ctx.runQuery(
      internal.project.getProjectDomainsInternal,
      {
        projectId: args.projectId,
        userRole: user?.role,
      },
    );

    return projectDomains.filter(
      (d: any) =>
        d.ownership_verified &&
        d.wildcard_cert_generated &&
        d.pointing_verified,
    );
  },
});

// Returns the total number of projects (using aggregates for real-time counting)
export const getProjectCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Use aggregates for efficient, real-time counting
    return await allProjects.count(ctx, { bounds: {} });
  },
});

export const setProjectName = mutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      name: args.name,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.management.setHTMLTitle,
      {
        projectId: args.projectId,
        title: args.name,
      },
    );

    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.management.setEnvVarTitle,
      {
        projectId: args.projectId,
        title: args.name,
      },
    );
  },
});

export const updatePackageManager = mutation({
  args: {
    projectId: v.id("project"),
    packageManager: v.union(v.literal("pnpm"), v.literal("bun")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      packageManager: args.packageManager,
    });
  },
});

export const deleteUninitializedProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_state", (q) => q.eq("state", "unassigned"))
      .collect();

    for (const project of projects) {
      const migrationRecord = await getProjectDaytonaMigrationByProjectId(
        ctx,
        project._id,
      );
      if (migrationRecord) {
        await ctx.db.delete(migrationRecord._id);
      }

      await ctx.db.delete(project._id);

      // Remove from aggregates
      await allProjects.delete(ctx, project);
      await projectsByDay.delete(ctx, project);
    }
  },
});

export const getProjectInspectorData = query({
  args: { semanticIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: god role required");
    }
    // Find the project by semantic_identifier
    const project = await ctx.db
      .query("project")
      .withIndex("by_semantic_identifier", (q) =>
        q.eq("semantic_identifier", args.semanticIdentifier),
      )
      .first();
    if (!project) return { error: "Project not found" };

    // Fetch entry points
    const entryPoints = await ctx.db
      .query("entry_point")
      .withIndex("by_project", (q) => q.eq("project", project._id))
      .collect();

    // Fetch messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_project_and_date", (q) => q.eq("project_id", project._id))
      .collect();

    return {
      projectData: project,
      entryPoints,
      messages,
    };
  },
});

export const csbDaytonaMigrationUpdate = internalMutation({
  args: {
    projectId: v.id("project"),
    daytonaSandboxId: v.string(),
    previewUrl: v.string(),
    templateId: v.string(),
    sandboxSize: v.optional(
      v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
    ),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await ctx.db.patch(args.projectId, {
      sandbox_id: `daytona:${args.daytonaSandboxId}`,
      preview_url: args.previewUrl,
      template_id: args.templateId,
      ...(args.sandboxSize && { sandbox_size: args.sandboxSize }),
    });

    await upsertProjectDaytonaMigration(ctx, args.projectId, {
      daytona_server: "legacy",
      legacy_sandbox_id: project.sandbox_id,
      updated_at: Date.now(),
    });
  },
});

export const updateDaytonaMigrationState = internalMutation({
  args: {
    projectId: v.id("project"),
    migrationStatus: v.union(
      v.literal("idle"),
      v.literal("queued"),
      v.literal("copying"),
      v.literal("validating"),
      v.literal("cutting_over"),
      v.literal("done"),
      v.literal("failed"),
    ),
    migrationError: v.optional(v.string()),
    targetSandboxId: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await upsertProjectDaytonaMigration(ctx, args.projectId, {
      migration_status: args.migrationStatus,
      migration_error: args.migrationError,
      migration_target_sandbox_id: args.targetSandboxId,
      migration_started_at: args.startedAt,
      migration_completed_at: args.completedAt,
      updated_at: Date.now(),
    });
  },
});

export const setProjectDaytonaServer = internalMutation({
  args: {
    projectId: v.id("project"),
    daytonaServer: v.union(v.literal("legacy"), v.literal("new")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await upsertProjectDaytonaMigration(ctx, args.projectId, {
      daytona_server: args.daytonaServer,
      updated_at: Date.now(),
    });
  },
});

export const finalizeDaytonaServerMigration = internalMutation({
  args: {
    projectId: v.id("project"),
    newSandboxId: v.string(),
    previewUrl: v.string(),
    templateId: v.optional(v.string()),
    newServer: v.union(v.literal("legacy"), v.literal("new")),
    packageManager: v.union(v.literal("bun"), v.literal("pnpm")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await ctx.db.patch(args.projectId, {
      sandbox_id: `daytona:${args.newSandboxId}`,
      packageManager: args.packageManager,
      preview_url: args.previewUrl,
      template_id: args.templateId,
    });

    await upsertProjectDaytonaMigration(ctx, args.projectId, {
      daytona_server: args.newServer,
      migration_status: "done",
      migration_error: undefined,
      legacy_sandbox_id: project.sandbox_id,
      migration_target_sandbox_id: args.newSandboxId,
      migration_completed_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

// Internal mutation to update project screenshot
export const updateProjectScreenshot = internalMutation({
  args: {
    projectId: v.id("project"),
    screenshotR2Url: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      screenshot_r2_url: args.screenshotR2Url,
    });
  },
});

// clear project screenshot reference
export const clearProjectScreenshot = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      screenshot_r2_url: undefined,
    });
    return null;
  },
});

// get screenshot metadata
export const getScreenshotMetadata = internalQuery({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(
    v.object({
      _id: v.id("_storage"),
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) {
      return null;
    }
    return {
      _id: metadata._id,
      _creationTime: metadata._creationTime,
    };
  },
});

// Get project screenshot storage ID
export const getProjectScreenshot = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
      "read",
      user,
    );
    if (!project) {
      throw new Error("Project not found or access denied");
    }

    return project.screenshot_r2_url;
  },
});
export const updateLastOpened = mutation({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Get project by semantic identifier and verify access
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
      undefined,
      "read",
      user,
    );

    if (!project) throw new Error("Project not found or access denied");

    // Update the last_opened timestamp
    await ctx.db.patch(project._id, {
      last_opened: Date.now(),
    });

    // Schedule background webhook validation (non-blocking)
    // This ensures usage logging webhooks are configured for both dev and prod deployments
    await ctx.scheduler.runAfter(0, internal.monitoring.ensureProjectWebhooks, {
      projectId: project._id,
    });
  },
});

/**
 * Soft-delete a project (preserves all project data)
 *
 * MODIFIED BEHAVIOR: This function marks the project as deleted instead of
 * actually deleting it. All project data is preserved.
 *
 * Current behavior:
 * - Sets the project's deleted field to true
 * - Preserves all project data, files, and configurations
 * - All project members retain their access (though the project is hidden)
 *
 * Data that is PRESERVED:
 * - All child database records (members, threads, messages, logs, etc.)
 * - Storage files (screenshots, message images)
 * - Related integration and deployment data
 * - All conversations and AI-generated content
 * - All metadata and analytics
 *
 * NOTE: The previous full deletion implementation has been commented out
 * in the handler below to preserve all project data. If full deletion is
 * needed in the future, the commented code can be restored.
 */
export const deleteProject = mutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
      "read",
      user,
    );
    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Mark the project as deleted (soft delete - preserves all project data)
    await ctx.db.patch(args.projectId, {
      deleted: true,
    });

    // Track sandbox deletion to decrement quota
    const sandboxSize = project.sandbox_size || "small"; // Default to small for legacy projects
    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.projectCrud.trackSandboxDeletion,
      {
        sandboxSize,
      },
    );

    return { success: true };

    // ==================== COMMENTED OUT: FULL PROJECT DELETION ====================
    // The code below has been commented out to preserve all project data
    // Only user access is now removed (see above)
    // ==============================================================================

    // // Delete all related child records first to maintain data consistency
    // // TODO: Consider using scheduled functions or batched operations for large datasets
    // // TODO: Add transaction support when available to ensure atomicity

    // // Delete project members
    // const projectMembers = await ctx.db
    //   .query("project_member")
    //   .withIndex("by_project", (q) => q.eq("project", args.projectId))
    //   .collect();
    // for (const member of projectMembers) {
    //   await ctx.db.delete(member._id);
    // }

    // // Delete project threads
    // const threads = await ctx.db
    //   .query("thread")
    //   .withIndex("by_project_by_entry_point", (q) =>
    //     q.eq("project", args.projectId),
    //   )
    //   .collect();
    // for (const thread of threads) {
    //   await ctx.db.delete(thread._id);
    // }

    // // Delete entry points
    // const entryPoints = await ctx.db
    //   .query("entry_point")
    //   .withIndex("by_project", (q) => q.eq("project", args.projectId))
    //   .collect();
    // for (const entryPoint of entryPoints) {
    //   await ctx.db.delete(entryPoint._id);
    // }

    // // Delete messages and their storage files (images)
    // const messages = await ctx.db
    //   .query("messages")
    //   .withIndex("by_project_and_date", (q) =>
    //     q.eq("project_id", args.projectId),
    //   )
    //   .collect();
    // for (const message of messages) {
    //   // Clean up any stored images associated with messages
    //   if (message.images) {
    //     for (const storageId of message.images) {
    //       try {
    //         await ctx.storage.delete(storageId);
    //       } catch (error) {
    //         console.warn(`Failed to delete storage file ${storageId}:`, error);
    //       }
    //     }
    //   }
    //   await ctx.db.delete(message._id);
    // }

    // // Delete message logs
    // // const messageLogs = await ctx.db
    // //   .query("message_logs")
    // //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    // //   .collect();
    // // for (const log of messageLogs) {
    // //   await ctx.db.delete(log._id);
    // // }

    // // Delete memory records
    // const memories = await ctx.db
    //   .query("memory")
    //   .filter((q) => q.eq(q.field("project"), args.projectId))
    //   .collect();
    // for (const memory of memories) {
    //   await ctx.db.delete(memory._id);
    // }

    // // Delete search logs
    // const searchLogs = await ctx.db
    //   .query("search_logs")
    //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    //   .collect();
    // for (const searchLog of searchLogs) {
    //   await ctx.db.delete(searchLog._id);
    // }

    // // Delete integration flow states
    // const integrationFlowStates = await ctx.db
    //   .query("integration_flow_state")
    //   .withIndex("by_project_thread", (q) => q.eq("project_id", args.projectId))
    //   .collect();
    // for (const flowState of integrationFlowStates) {
    //   await ctx.db.delete(flowState._id);
    // }

    // // Delete runtime errors
    // const runtimeErrors = await ctx.db
    //   .query("runtime_error")
    //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    //   .collect();
    // for (const error of runtimeErrors) {
    //   await ctx.db.delete(error._id);
    // }

    // // Delete build errors
    // const buildErrors = await ctx.db
    //   .query("build_error")
    //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    //   .collect();
    // for (const error of buildErrors) {
    //   await ctx.db.delete(error._id);
    // }

    // // Delete deployments
    // const deployments = await ctx.db
    //   .query("deployments")
    //   .withIndex("by_project_and_state", (q) => q.eq("project", args.projectId))
    //   .collect();
    // for (const deployment of deployments) {
    //   await ctx.db.delete(deployment._id);
    // }

    // // Delete invites
    // const invites = await ctx.db
    //   .query("invites")
    //   .withIndex("by_project", (q) => q.eq("project", args.projectId))
    //   .collect();
    // for (const invite of invites) {
    //   await ctx.db.delete(invite._id);
    // }

    // // Delete project integrations
    // const projectIntegrations = await ctx.db
    //   .query("project_integration")
    //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    //   .collect();
    // for (const integration of projectIntegrations) {
    //   await ctx.db.delete(integration._id);
    // }

    // // Delete project domains
    // const projectDomains = await ctx.db
    //   .query("project_domain")
    //   .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    //   .collect();
    // for (const domain of projectDomains) {
    //   await ctx.db.delete(domain._id);
    // }

    // // Clean up project storage files (screenshots)
    // if (project.screenshot_storage_id) {
    //   try {
    //     await ctx.storage.delete(project.screenshot_storage_id);
    //   } catch (error) {
    //     console.warn(
    //       `Failed to delete project screenshot ${project.screenshot_storage_id}:`,
    //       error,
    //     );
    //   }
    // }

    // // Delete the project (parent record)
    // await ctx.db.delete(args.projectId);

    // return { success: true };
  },
});

// Internal query version of getVerifiedAccessProject for use by actions
export const getVerifiedAccessProjectInternal = internalQuery({
  args: {
    userId: v.id("users"),
    semanticIdentifier: v.optional(v.string()),
    projectId: v.optional(v.id("project")),
  },
  handler: async (ctx, args) => {
    return await getVerifiedAccessProject(
      ctx,
      args.userId,
      args.semanticIdentifier,
      args.projectId,
    );
  },
});

/**
 * Look up project by Convex deployment name
 * Searches both dev and prod deployment names
 */
export const getProjectByDeploymentName = internalQuery({
  args: {
    deploymentName: v.string(),
  },
  handler: async (ctx, args) => {
    // Try to find by dev deployment name first (using index for efficiency)
    const devInstance = await ctx.db
      .query("project_convex_instance")
      .withIndex("by_dev_deployment_name", (q) =>
        q.eq("devDeploymentName", args.deploymentName),
      )
      .first();

    if (devInstance) {
      const project = await ctx.db.get(devInstance.projectId);
      return project;
    }

    // If not found, try prod deployment name (using index)
    const prodInstance = await ctx.db
      .query("project_convex_instance")
      .withIndex("by_prod_deployment_name", (q) =>
        q.eq("prodDeploymentName", args.deploymentName),
      )
      .first();

    if (prodInstance) {
      const project = await ctx.db.get(prodInstance.projectId);
      return project;
    }

    // Not found
    return null;
  },
});

/**
 * Get project owner information
 * Returns user details for personal projects or organization ID for org projects
 */
export const getProjectOwner = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }

    // Check if project is organization-owned
    if (project.organization_id) {
      return {
        type: "organization" as const,
        organization_id: project.organization_id,
      };
    }

    // For personal projects, find the owner from project_member
    const owner = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .filter((q) => q.eq(q.field("project_role"), "owner"))
      .first();

    if (!owner) {
      return null;
    }

    // Get user details
    const user = await ctx.db.get(owner.user);
    if (!user) {
      return null;
    }

    return {
      type: "user" as const,
      user: {
        name: user.name,
        email: user.email,
        clerk_id: user.clerk_id,
      },
    };
  },
});

export const getConvexInstance = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"project_convex_instance"> | null> => {
    return await ctx.runQuery(internal.project.getConvexInstanceInternal, {
      projectId: args.projectId,
    });
  },
});

export const getConvexInstanceInternal = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const convexInstance = await ctx.db
      .query("project_convex_instance")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    return convexInstance;
  },
});

/**
 * Remove excess members when a user downgrades their plan.
 * Members are removed in LIFO order (most recently added first).
 * Project owners are never removed.
 *
 * @param userId - The ID of the user whose plan is being downgraded
 * @param newMemberLimit - The new total member limit for the user
 * @returns Object with removed count and details
 */
export const removeExcessMembersOnDowngrade = internalMutation({
  args: {
    userId: v.id("users"),
    newMemberLimit: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all projects where this user is the owner
    const ownedProjectMemberships = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .filter((q) => q.eq(q.field("project_role"), "owner"))
      .collect();

    // Collect all members from all owned projects with their creation time
    const allMembers: Array<{
      membershipId: (typeof ownedProjectMemberships)[0]["_id"];
      projectId: (typeof ownedProjectMemberships)[0]["project"];
      userId: (typeof ownedProjectMemberships)[0]["user"];
      role: (typeof ownedProjectMemberships)[0]["project_role"];
      creationTime: number;
    }> = [];

    for (const ownership of ownedProjectMemberships) {
      const projectMembers = await ctx.db
        .query("project_member")
        .withIndex("by_project", (q) => q.eq("project", ownership.project))
        .collect();

      for (const member of projectMembers) {
        allMembers.push({
          membershipId: member._id,
          projectId: member.project,
          userId: member.user,
          role: member.project_role,
          creationTime: member._creationTime,
        });
      }
    }

    const currentTotal = allMembers.length;

    if (currentTotal <= args.newMemberLimit) {
      return {
        removedCount: 0,
        removedMembers: [],
        message: "No members need to be removed",
      };
    }

    // Sort by creation time descending (most recent first) for LIFO removal
    // Filter out owners - they can never be removed
    const removableMembersLIFO = allMembers
      .filter((m) => m.role !== "owner")
      .sort((a, b) => b.creationTime - a.creationTime);

    const membersToRemove = currentTotal - args.newMemberLimit;
    const membersToDelete = removableMembersLIFO.slice(0, membersToRemove);

    const removedMembers: Array<{ projectId: string; userId: string }> = [];

    for (const member of membersToDelete) {
      await ctx.db.delete(member.membershipId);
      removedMembers.push({
        projectId: member.projectId,
        userId: member.userId,
      });
    }

    return {
      removedCount: removedMembers.length,
      removedMembers,
      message: `Removed ${removedMembers.length} member(s) to comply with new limit of ${args.newMemberLimit}`,
    };
  },
});

/**
 * Get the total member count across all projects owned by a user
 */
export const getTotalMemberCountForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get all projects where this user is the owner
    const ownedProjectMemberships = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .filter((q) => q.eq(q.field("project_role"), "owner"))
      .collect();

    // For each owned project, count all members
    let totalMemberCount = 0;
    for (const ownership of ownedProjectMemberships) {
      const projectMembers = await ctx.db
        .query("project_member")
        .withIndex("by_project", (q) => q.eq("project", ownership.project))
        .collect();
      totalMemberCount += projectMembers.length;
    }

    return totalMemberCount;
  },
});
