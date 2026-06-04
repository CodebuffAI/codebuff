import { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getAuthUser } from "./users";
import { getVerifiedAccessProject } from "./project";

// Internal cacheable version - enables Convex query caching for individual integrations
// This provides maximum cache reuse since each integration ID is cached independently
export const getIntegrationByIdInternal = internalQuery({
  args: {
    integrationId: v.id("integration"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.integrationId);
  },
});

// Get a single integration by ID
export const getIntegrationById = query({
  args: {
    integrationId: v.id("integration"),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.integrations.getIntegrationByIdInternal,
      {
        integrationId: args.integrationId,
      },
    );
  },
});

// Get multiple integrations by IDs (batch query to avoid N+1 problem)
// Uses individual cached queries for maximum cache reuse across different messages
export const getIntegrationsByIds = query({
  args: {
    integrationIds: v.array(v.id("integration")),
  },
  handler: async (ctx, args): Promise<any[]> => {
    // Each call benefits from individual integration caching
    // This is better than batch caching because integrations are reused across messages
    const integrations = await Promise.all(
      args.integrationIds.map((id) =>
        ctx.runQuery(internal.integrations.getIntegrationByIdInternal, {
          integrationId: id,
        }),
      ),
    );
    return integrations.filter(
      (i: any): i is NonNullable<typeof i> => i !== null,
    );
  },
});

// Get integrations for a specific project
export const getProjectIntegrations = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Note: No feature check here - viewing existing project integrations
    // should not block project access. Feature access is enforced when
    // adding new integrations via addIntegrationToProject mutation.

    // Verify project access and get project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    // Get project integrations
    const projectIntegrations = await ctx.db
      .query("project_integration")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    // Get full integration details
    const integrations = await Promise.all(
      projectIntegrations.map(async (pi) => {
        const integration = await ctx.db.get(pi.integrationId);
        return integration;
      }),
    );

    return integrations.filter(
      (i: any): i is NonNullable<typeof i> => i !== null,
    );
  },
});

// Internal version of getProjectIntegrations that takes projectId directly
export const getProjectIntegrationsInternal = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    // Get project integrations
    const projectIntegrations = await ctx.db
      .query("project_integration")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Get full integration details
    const integrations = await Promise.all(
      projectIntegrations.map(async (pi) => {
        const integration = await ctx.db.get(pi.integrationId);
        return integration;
      }),
    );

    return integrations.filter(
      (i: any): i is NonNullable<typeof i> => i !== null,
    );
  },
});

// Internal cacheable version - accepts userRole to avoid JWT lookup
export const getIntegrationsInternal = internalQuery({
  args: {
    userRole: v.optional(v.string()),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Scope the base query using indexes so we never scan the whole table
    // If search provided, use search index so filtering occurs before pagination
    if (args.search) {
      // Non-god users: restrict to public results using filterFields
      const searchPage =
        args.userRole === "god"
          ? await ctx.db
              .query("integration")
              .withSearchIndex("search_all", (q) =>
                q.search("search_text", args.search!),
              )
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("integration")
              .withSearchIndex("search_all", (q) =>
                q.search("search_text", args.search!).eq("public", true),
              )
              .paginate(args.paginationOpts);
      return searchPage;
    }

    // No search term: just paginate by public/non-public
    const baseQuery =
      args.userRole === "god"
        ? ctx.db.query("integration").withIndex("by_last_updated")
        : ctx.db
            .query("integration")
            .withIndex("by_public_and_last_updated", (q) =>
              q.eq("public", true),
            );

    return await baseQuery.order("desc").paginate(args.paginationOpts);
  },
});

// Get all integrations (library) with server-side pagination and lightweight search
export const getIntegrations = query({
  args: {
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // No feature check here - viewing the integrations library should be
    // accessible to all users. Feature access is enforced when adding
    // integrations to a project via addIntegrationToProject mutation.

    // Delegate to internal cached version
    return await ctx.runQuery(internal.integrations.getIntegrationsInternal, {
      userRole: user.role,
      search: args.search,
      paginationOpts: args.paginationOpts,
    });
  },
});

// Add a new integration
export const addIntegration = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    cover_image: v.string(),
    tags: v.array(v.string()),
    documentation_urls: v.array(v.string()),
    llm_instructions: v.string(),
    user_instructions: v.string(),
    human_added_notes: v.optional(v.string()),
    env_variables: v.optional(
      v.array(
        v.object({
          id: v.string(),
          description: v.string(),
        }),
      ),
    ),
    images: v.optional(v.array(v.string())),
    projectId: v.optional(v.id("project")),
    semanticIdentifier: v.optional(v.string()),
    recommended: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    let projectId: Id<"project"> | undefined = args.projectId;
    if (!projectId && args.semanticIdentifier) {
      const project = await getVerifiedAccessProject(
        ctx,
        user._id,
        args.semanticIdentifier,
      );
      if (!project) projectId = undefined;
      else projectId = project._id;
    }

    // Create the integration
    const integrationId = await ctx.db.insert("integration", {
      ...args,
      public: false,
      type: "user generated",
      creator: projectId,
      last_updated: Date.now(),
      reference_id: args.title.toLowerCase().replace(/\s+/g, "_"),
      search_text:
        `${args.title} ${args.description} ${(args.tags || []).join(" ")}`.toLowerCase(),
      approval_status: "pending", // User-generated integrations start as pending
    });

    return await ctx.db.get(integrationId);
  },
});

export const addIntegrationInternal = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    cover_image: v.string(),
    tags: v.array(v.string()),
    documentation_urls: v.array(v.string()),
    llm_instructions: v.string(),
    user_instructions: v.string(),
    human_added_notes: v.optional(v.string()),
    env_variables: v.optional(
      v.array(
        v.object({
          id: v.string(),
          description: v.string(),
        }),
      ),
    ),
    images: v.optional(v.array(v.string())),
    projectId: v.id("project"),
    recommended: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Create the integration
    const integrationId = await ctx.db.insert("integration", {
      ...args,
      public: false,
      type: "user generated",
      creator: args.projectId,
      last_updated: Date.now(),
      reference_id: args.title.toLowerCase().replace(/\s+/g, "_"),
      search_text:
        `${args.title} ${args.description} ${(args.tags || []).join(" ")}`.toLowerCase(),
      approval_status: "pending", // User-generated integrations start as pending
    });

    return await ctx.db.get(integrationId);
  },
});

export const addIntegrationToLibraryAndProject = internalMutation({
  args: {
    integration: v.object({
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      env_variables: v.array(
        v.object({
          id: v.string(),
          description: v.string(),
        }),
      ),
      user_instructions: v.string(),
      llm_instructions: v.string(),
      documentation_urls: v.array(v.string()),
      cover_image: v.string(),
      context7_library_id: v.optional(v.string()),
      public: v.optional(v.boolean()),
    }),
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    // Generate a reference_id from the title
    const reference_id = args.integration.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Add integration to library
    const integrationId = await ctx.db.insert("integration", {
      ...args.integration,
      reference_id,
      public: args.integration.public ?? true, // Use agent-determined public status, default to false
      type: "user generated",
      creator: args.projectId,
      last_updated: Date.now(),
      approval_status: "pending", // User-generated integrations start as pending
    });

    // Add integration to project
    await ctx.db.insert("project_integration", {
      projectId: args.projectId,
      integrationId,
    });

    // Return the created integration
    const integration = await ctx.db.get(integrationId);
    return integration;
  },
});

// Add an integration to a project
export const addIntegrationToProject = mutation({
  args: {
    semanticIdentifier: v.string(),
    integrationId: v.id("integration"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Feature access is enforced client-side via useFeatureAccess hook
    // in IntegrationsLibrary.tsx (shows upgrade dialog for users without access).
    // Server-side autumn.check() was incorrectly blocking Business+ plan users
    // due to Autumn API sync issues, so the hard gate was removed here.

    // Verify project access and get project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    // Check if integration exists
    const integration = await ctx.db.get(args.integrationId);
    if (!integration) throw new Error("Integration not found");

    // Check if integration is already added to project
    const existing = await ctx.db
      .query("project_integration")
      .withIndex("by_project_and_integration", (q) =>
        q.eq("projectId", project._id).eq("integrationId", args.integrationId),
      )
      .unique();

    if (existing) {
      throw new Error("Integration already added to project");
    }

    // Add integration to project
    await ctx.db.insert("project_integration", {
      projectId: project._id,
      integrationId: args.integrationId,
    });

    return true;
  },
});

export const addIntegrationReferenceIdToProject = internalMutation({
  args: {
    projectId: v.id("project"),
    integrationReferenceId: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    // find integration based on name using name index - use first() instead of unique()
    const integration = await ctx.db
      .query("integration")
      .withIndex("by_reference_id", (q) =>
        q.eq("reference_id", args.integrationReferenceId),
      )
      .first();

    if (!integration) throw new Error("Integration not found");

    // Check if integration is already added to project
    const existing = await ctx.db
      .query("project_integration")
      .withIndex("by_project_and_integration", (q) =>
        q.eq("projectId", project._id).eq("integrationId", integration._id),
      )
      .first();

    if (existing) {
      // Don't throw error, just return success silently
      console.log(
        `[addIntegrationReferenceIdToProject] Integration ${args.integrationReferenceId} already exists in project`,
      );
      return integration;
    }

    // add integration to project
    await ctx.db.insert("project_integration", {
      projectId: args.projectId,
      integrationId: integration._id,
    });

    return integration; // return the integration details
  },
});

// Remove an integration from a project
export const removeIntegrationFromProject = mutation({
  args: {
    semanticIdentifier: v.string(),
    integrationId: v.id("integration"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify project access and get project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    // Find and delete the project integration
    const projectIntegration = await ctx.db
      .query("project_integration")
      .withIndex("by_project_and_integration", (q) =>
        q.eq("projectId", project._id).eq("integrationId", args.integrationId),
      )
      .unique();

    if (!projectIntegration) {
      throw new Error("Integration not found in project");
    }

    await ctx.db.delete(projectIntegration._id);
    return true;
  },
});

// Generate an upload URL for file uploads
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

// Save a file URL to the integration
export const saveFileUrl = mutation({
  args: {
    storageId: v.id("_storage"),
    type: v.union(v.literal("logo"), v.literal("image")),
    index: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  },
});

// takes in an array and returns all threads
export const getIntegrationsInContext = internalQuery({
  args: {
    integrationIds: v.array(v.id("integration")),
  },
  handler: async (ctx, args) => {
    const integrations = [];
    for (const integrationId of args.integrationIds) {
      if (!integrationId) continue;
      const integration = await ctx.db.get(integrationId);
      if (integration) {
        integrations.push(integration);
      }
    }
    return integrations;
  },
});

export const getAllIntegrations = internalQuery({
  args: {
    projectId: v.id("project"),
    searchQuery: v.optional(v.string()), // Optional search query to filter integrations
  },
  handler: async (ctx, args) => {
    let publicIntegrations;

    if (args.searchQuery) {
      const result = await ctx.db
        .query("integration")
        .withSearchIndex("search_all", (q) =>
          q.search("search_text", args.searchQuery!).eq("public", true),
        )
        .paginate({ numItems: 3, cursor: null });
      publicIntegrations = result.page;
    } else {
      publicIntegrations = await ctx.db
        .query("integration")
        .withIndex("by_public", (q) => q.eq("public", true))
        .take(3);
    }

    // Get all integrationIds already in the project
    const projectIntegrations = await ctx.db
      .query("project_integration")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const projectIntegrationIds = new Set(
      projectIntegrations.map((pi) => pi.integrationId.toString()),
    );

    // Filter out integrations already in the project
    const filteredIntegrations = publicIntegrations.filter(
      (integration) => !projectIntegrationIds.has(integration._id.toString()),
    );

    return filteredIntegrations.map((integration) => ({
      title: integration.title,
      description: integration.description,
      reference_id: integration.reference_id,
      tags: integration.tags || [],
    }));
  },
});

export const updateIntegration = mutation({
  args: {
    integrationId: v.id("integration"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    cover_image: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    documentation_urls: v.optional(v.array(v.string())),
    llm_instructions: v.optional(v.string()),
    user_instructions: v.optional(v.string()),
    human_added_notes: v.optional(v.string()),
    env_variables: v.optional(
      v.array(
        v.object({
          id: v.string(),
          description: v.string(),
        }),
      ),
    ),
    images: v.optional(v.array(v.string())),
    public: v.optional(v.boolean()),
    type: v.optional(v.string()),
    approval_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "god" && user.role !== "admin") {
      throw new Error("Not authorized");
    }

    const updateData: Record<string, any> = {};
    if (args.title !== undefined) updateData.title = args.title;
    if (args.description !== undefined)
      updateData.description = args.description;
    if (args.cover_image !== undefined)
      updateData.cover_image = args.cover_image;
    if (args.tags !== undefined) updateData.tags = args.tags;
    if (args.documentation_urls !== undefined)
      updateData.documentation_urls = args.documentation_urls;
    if (args.llm_instructions !== undefined)
      updateData.llm_instructions = args.llm_instructions;
    if (args.user_instructions !== undefined)
      updateData.user_instructions = args.user_instructions;
    if (args.human_added_notes !== undefined)
      updateData.human_added_notes = args.human_added_notes;
    if (args.env_variables !== undefined)
      updateData.env_variables = args.env_variables;
    if (args.images !== undefined) updateData.images = args.images;
    if (args.type !== undefined) updateData.type = args.type;

    // Handle approval status and auto-set public flag
    if (args.approval_status !== undefined) {
      updateData.approval_status = args.approval_status;
      // Auto-set public flag based on approval status
      if (args.approval_status === "approved") {
        updateData.public = true;
      } else if (
        args.approval_status === "pending" ||
        args.approval_status === "rejected"
      ) {
        updateData.public = false;
      }
    }
    updateData.last_updated = Date.now();

    // Keep unified search_text in sync if relevant fields changed
    if (
      updateData.title !== undefined ||
      updateData.description !== undefined ||
      updateData.tags !== undefined
    ) {
      const current = await ctx.db.get(args.integrationId);
      if (current) {
        const title = updateData.title ?? current.title;
        const description = updateData.description ?? current.description;
        const tags = (updateData.tags ?? current.tags) || [];
        updateData.search_text =
          `${title} ${description} ${tags.join(" ")}`.toLowerCase();
      }
    }

    await ctx.db.patch(args.integrationId, updateData);
    return await ctx.db.get(args.integrationId);
  },
});

export const deleteIntegration = mutation({
  args: {
    integrationId: v.id("integration"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    // Allow both god and admin roles
    if (user.role !== "god" && user.role !== "admin") {
      throw new Error("Not authorized");
    }

    // Delete all project associations first
    const projectIntegrations = await ctx.db
      .query("project_integration")
      .withIndex("by_integration", (q) =>
        q.eq("integrationId", args.integrationId),
      )
      .collect();

    for (const pi of projectIntegrations) {
      await ctx.db.delete(pi._id);
    }

    // Then delete the integration
    await ctx.db.delete(args.integrationId);
    return true;
  },
});

// Integration logs - for tracking integration creation process
export const createIntegrationLog = internalMutation({
  args: {
    projectId: v.id("project"),
    query: v.string(),
  },
  returns: v.id("integration_logs"),
  handler: async (ctx, args) => {
    const logId = await ctx.db.insert("integration_logs", {
      projectId: args.projectId,
      query: args.query,
      status: "draft",
      type: "existing", // Default to existing, will be updated
      steps: [],
      created_at: Date.now(),
    });
    return logId;
  },
});

export const addIntegrationLogStep = internalMutation({
  args: {
    logId: v.id("integration_logs"),
    step: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) throw new Error("Integration log not found");

    // Truncate individual step if it's too large (max 10 KB per step)
    const truncatedStep = truncateString(args.step, 10 * 1024, "log step");

    await ctx.db.patch(args.logId, {
      steps: [...log.steps, `[${new Date().toISOString()}] ${truncatedStep}`],
    });
    return null;
  },
});

export const updateIntegrationLogType = internalMutation({
  args: {
    logId: v.id("integration_logs"),
    type: v.union(v.literal("existing"), v.literal("new")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.logId, {
      type: args.type,
    });
    return null;
  },
});

// Helper function to truncate strings to prevent exceeding 1 MiB limit
function truncateString(
  str: string,
  maxBytes: number,
  fieldName?: string,
): string {
  if (!str) return str;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  if (bytes.length <= maxBytes) {
    return str;
  }

  // Log warning when truncation occurs
  const originalSize = (bytes.length / 1024).toFixed(2);
  const truncatedSize = (maxBytes / 1024).toFixed(2);
  console.error(
    `[Integration Logs] Truncation warning: ${fieldName || "Field"} exceeded size limit. ` +
      `Original: ${originalSize} KB, Truncated to: ${truncatedSize} KB`,
  );

  // Truncate and add indicator
  const decoder = new TextDecoder();
  const truncated = decoder.decode(bytes.slice(0, maxBytes));
  return truncated + "\n\n[... truncated due to size limit]";
}

export const updateIntegrationLogDeepResearch = internalMutation({
  args: {
    logId: v.id("integration_logs"),
    deep_research_results: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Truncate to 400 KB to leave room for other fields
    const truncated = truncateString(
      args.deep_research_results,
      400 * 1024,
      "deep_research_results",
    );

    await ctx.db.patch(args.logId, {
      deep_research_results: truncated,
    });
    return null;
  },
});

export const updateIntegrationLogContext7Results = internalMutation({
  args: {
    logId: v.id("integration_logs"),
    context7_results: v.object({
      searched: v.boolean(),
      search_results: v.optional(v.string()),
      results_count: v.optional(v.number()),
      selected_library_id: v.optional(v.string()),
      raw_documentation: v.optional(v.string()),
      documentation_length: v.optional(v.number()),
      error: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Truncate large fields to prevent exceeding 1 MiB
    const truncatedResults = {
      ...args.context7_results,
      search_results: args.context7_results.search_results
        ? truncateString(
            args.context7_results.search_results,
            100 * 1024,
            "context7_results.search_results",
          ) // 100 KB limit
        : undefined,
      raw_documentation: args.context7_results.raw_documentation
        ? truncateString(
            args.context7_results.raw_documentation,
            300 * 1024,
            "context7_results.raw_documentation",
          ) // 300 KB limit
        : undefined,
    };

    await ctx.db.patch(args.logId, {
      context7_results: truncatedResults,
    });
    return null;
  },
});

export const completeIntegrationLog = internalMutation({
  args: {
    logId: v.id("integration_logs"),
    integrationId: v.id("integration"),
    status: v.union(
      v.literal("created"),
      v.literal("already_existing"),
      v.literal("failed"),
    ),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.logId, {
      integrationId: args.integrationId,
      status: args.status,
      result: args.result
        ? truncateString(args.result, 50 * 1024, "result")
        : undefined,
      error: args.error
        ? truncateString(args.error, 50 * 1024, "error")
        : undefined,
      completed_at: Date.now(),
    });
    return null;
  },
});

export const failIntegrationLog = internalMutation({
  args: {
    logId: v.id("integration_logs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.logId, {
      status: "failed",
      error: truncateString(args.error, 50 * 1024, "error"),
      completed_at: Date.now(),
    });
    return null;
  },
});

// Query functions for integration logs
export const getIntegrationLogs = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    const logs = await ctx.db
      .query("integration_logs")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .order("desc")
      .collect();

    return logs;
  },
});

export const getIntegrationLog = query({
  args: {
    logId: v.id("integration_logs"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const log = await ctx.db.get(args.logId);
    if (!log) throw new Error("Integration log not found");

    // Verify user has access to the project
    const project = await ctx.db.get(log.projectId);
    if (!project) throw new Error("Project not found");

    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", project._id).eq("user", user._id),
      )
      .unique();

    if (!projectMember && user.role !== "god" && user.role !== "admin") {
      throw new Error("Not authorized to view this integration log");
    }

    return log;
  },
});
// List all user-generated integrations (any status)
export const listAllUserGeneratedIntegrations = query({
  args: {
    approval_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "god" && user.role !== "admin") {
      throw new Error("Not authorized");
    }

    if (args.approval_status) {
      return await ctx.db
        .query("integration")
        .withIndex("by_type_and_approval_status", (q) =>
          q
            .eq("type", "user generated")
            .eq("approval_status", args.approval_status),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("integration")
      .withIndex("by_type_and_approval_status", (q) =>
        q.eq("type", "user generated"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
