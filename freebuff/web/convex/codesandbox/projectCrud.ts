import { createNewThread } from "!/thread";
import { v } from "convex/values";
import { humanId } from "human-id";
import { api, internal } from "../_generated/api";
import {
  internalMutation,
  internalAction,
  MutationCtx,
} from "../_generated/server";
import { allProjects, projectsByDay } from "../aggregates/admin_aggregates";

/**
 * Creates a new unassigned project, returns the project id
 */
export const createUnassignedProject = internalMutation({
  args: {
    preview_url: v.string(),
    sandbox_id: v.string(),
    github_url: v.optional(v.string()),
    template_id: v.optional(v.string()),
    convex_url: v.optional(v.string()),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
    daytona_server: v.optional(v.union(v.literal("legacy"), v.literal("new"))),
  },
  handler: async (ctx, args) => {
    const semanticIdentifier = await getUniqueProjectIdentifier(ctx);

    const projectId = await ctx.db.insert("project", {
      semantic_identifier: semanticIdentifier,
      sandbox_id: args.sandbox_id,
      state: "unassigned",
      preview_url: args.preview_url,
      github_url: args.github_url,
      template_id: args.template_id,
      convex_url: args.convex_url,
      sandbox_size: "small", // All new projects start as small
      packageManager: args.packageManager ?? "bun", // Fallback to bun if not detected (should rarely happen)
      last_dist_build_at: 0,
    });

    await ctx.db.insert("daytona_migration", {
      project_id: projectId,
      daytona_server: args.daytona_server ?? "legacy",
      migration_status: "idle",
      updated_at: Date.now(),
    });

    // Update aggregates for new project
    const newProject = await ctx.db.get(projectId);
    if (newProject) {
      await allProjects.insert(ctx, newProject);
      await projectsByDay.insert(ctx, newProject);
    }

    // Track sandbox usage in Autumn (all new projects start as small)
    // Note: This will be tracked when the project is assigned to a user
    // For now, unassigned projects don't count toward quota

    // Create initial thread
    await createNewThread(ctx, projectId);

    await ctx.db.insert("entry_point", {
      project: projectId,
      type: "page",
      associated_files: ["src/pages/Landing.tsx"],
      abstraction: "",
      page: {
        page_title: "Home",
        page_display_url: "/",
        page_file: "src/pages/Landing.tsx",
        has_dynamic_params: false,
        navigation_paths: [],
      },
      status: "active",
    });

    return { id: projectId, semanticIdentifier };
  },
});

export const assignProjectToUser = internalMutation({
  args: {
    userId: v.id("users"),
    initialDocumentContent: v.string(),
    images: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("project")
      .withIndex("by_state", (q) => q.eq("state", "unassigned"))
      .first();
    if (!project) {
      return null;
    }

    await ctx.db.patch(project._id, {
      state: "active",
      last_opened: Date.now(),
    });

    await ctx.db.insert("project_member", {
      project: project._id,
      user: args.userId,
      project_role: "owner",
    });

    // Track small sandbox usage in Autumn when project is assigned
    // Schedule an action to track usage (mutations can't call actions directly)
    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.projectCrud.trackInitialSandboxUsage,
      {
        projectId: project._id,
      },
    );

    await ctx.scheduler.runAfter(
      0,
      api.coding_agent.trigger.saveMessageAndStartWorkflow,
      {
        projectSemanticIdentifier: project.semantic_identifier,
        message: args.initialDocumentContent,
        images: args.images,
        agentMode: "POWERFUL",
      },
    );

    return project.semantic_identifier;
  },
});

export const getUniqueProjectIdentifier = async (ctx: MutationCtx) => {
  let wordCount = 3;
  while (true) {
    const identifier = getProjectIdentifier(wordCount);
    const existingProject = await ctx.db
      .query("project")
      .withIndex("by_semantic_identifier", (q) =>
        q.eq("semantic_identifier", identifier),
      )
      .first();
    if (!existingProject) {
      return identifier;
    }
    wordCount++;

    if (wordCount > 10) {
      throw new Error("Failed to generate a unique project identifier");
    }
  }
};

const getProjectIdentifier = (wordCount = 4) => {
  // start with 2, move up to 4
  if (wordCount === 2) {
    return humanId({
      separator: "-",
      capitalize: false,
      adjectiveCount: 0,
    });
  } else if (wordCount === 3) {
    return humanId({
      separator: "-",
      capitalize: false,
      adjectiveCount: 1,
    });
  } else {
    return humanId({
      separator: "-",
      capitalize: false,
      adjectiveCount: wordCount - 3,
      addAdverb: true, // adds fourth word
    });
  }
  //"-" +
  //Math.floor(Math.random() * 99 + 1)
};

/**
 * Internal action to track initial sandbox usage in Autumn
 * Called when a project is assigned to a user
 */
export const trackInitialSandboxUsage = internalAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    void args; // projectId passed for potential future use
    return { success: true };
  },
});

/**
 * Internal action to track sandbox deletion in Autumn
 * Called when a project is deleted to decrement quota
 */
export const trackSandboxDeletion = internalAction({
  args: {
    sandboxSize: v.union(
      v.literal("small"),
      v.literal("medium"),
      v.literal("large"),
    ),
  },
  handler: async (ctx, args) => {
    void args;
    return { success: true };
  },
});

// allows you to update any field in a project using either the project id or the semantic identifier
export const updateProjectField = internalMutation({
  args: {
    projectId: v.optional(v.id("project")),
    semanticIdentifier: v.optional(v.string()),
    name: v.optional(v.string()),
    owner: v.optional(v.id("users")),
    semantic_identifier: v.optional(v.string()),
    sandbox_id: v.optional(v.string()),
    state: v.optional(v.string()),
    github_url: v.optional(v.string()),
    preview_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updatedFields = {
      ...(args.name && { name: args.name }),
      ...(args.owner && { owner: args.owner }),
      ...(args.semantic_identifier && {
        semantic_identifier: args.semantic_identifier,
      }),
      ...(args.sandbox_id && { sandbox_id: args.sandbox_id }),
      ...(args.state && {
        state: args.state as
          | "initializing"
          | "unassigned"
          | "active"
          | "processing",
      }),
      ...(args.github_url && { github_url: args.github_url }),
      ...(args.preview_url && { preview_url: args.preview_url }),
    };
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new Error("Project not found");
      }
      await ctx.db.patch(args.projectId, {
        ...updatedFields,
      });
    } else if (args.semanticIdentifier) {
      const project = await ctx.db
        .query("project")
        .withIndex("by_semantic_identifier", (q) =>
          q.eq("semantic_identifier", args.semanticIdentifier!),
        )
        .first();
      if (!project) {
        throw new Error("Project not found");
      }
      await ctx.db.patch(project._id, {
        ...updatedFields,
      });
    } else {
      throw new Error("No project id or semantic identifier provided");
    }
  },
});
