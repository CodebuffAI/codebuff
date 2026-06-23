import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { allProjects, projectsByDay } from "../aggregates/admin_aggregates";
import { getUniqueProjectIdentifier } from "../codesandbox/projectCrud";

const runtimeConfigValidator = v.object({
  install_command: v.optional(v.string()),
  preview_command: v.optional(v.string()),
  preview_port: v.optional(v.number()),
  build_command: v.optional(v.string()),
  detection_status: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("detecting"),
      v.literal("ready"),
      v.literal("failed"),
    ),
  ),
});

/**
 * Create a connected-repo project (Freebuff Cloud) and assign the creating
 * user as owner. Unlike template projects, these are not pulled from a pool
 * and have no auto-provisioned Convex backend.
 */
export const createConnectedRepoProject = internalMutation({
  args: {
    userId: v.id("users"),
    sandbox_id: v.string(),
    repo_full_name: v.string(),
    repo_default_branch: v.string(),
    github_installation_id: v.number(),
    github_url: v.string(),
    template_id: v.optional(v.string()),
    preview_url: v.optional(v.string()),
    packageManager: v.optional(v.union(v.literal("pnpm"), v.literal("bun"))),
    organization_id: v.optional(v.string()),
  },
  returns: v.object({
    projectId: v.id("project"),
    semanticIdentifier: v.string(),
  }),
  handler: async (ctx, args) => {
    const semanticIdentifier = await getUniqueProjectIdentifier(ctx);

    const projectId = await ctx.db.insert("project", {
      name: args.repo_full_name.split("/").pop(),
      semantic_identifier: semanticIdentifier,
      sandbox_id: args.sandbox_id,
      state: "active",
      preview_url: args.preview_url,
      github_url: args.github_url,
      template_id: args.template_id,
      sandbox_size: "small",
      packageManager: args.packageManager ?? "bun",
      last_dist_build_at: 0,
      project_type: "connected_repo",
      repo_full_name: args.repo_full_name,
      repo_default_branch: args.repo_default_branch,
      current_branch: args.repo_default_branch,
      github_installation_id: args.github_installation_id,
      runtime_config: { detection_status: "pending" },
      ...(args.organization_id ? { organization_id: args.organization_id } : {}),
    });

    await ctx.db.insert("daytona_migration", {
      project_id: projectId,
      daytona_server: "new",
      migration_status: "idle",
      updated_at: Date.now(),
    });

    await ctx.db.insert("project_member", {
      project: projectId,
      user: args.userId,
      project_role: "owner",
    });

    const newProject = await ctx.db.get(projectId);
    if (newProject) {
      await allProjects.insert(ctx, newProject);
      await projectsByDay.insert(ctx, newProject);
    }

    return { projectId, semanticIdentifier };
  },
});

/** Internal: fetch a project and confirm it is a connected-repo project. */
export const getConnectedRepoProject = internalQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    return project;
  },
});

/**
 * Internal: resolve a connected-repo project by semantic identifier and verify
 * the given user is a member. Returns null if the project doesn't exist, isn't
 * a connected repo, or the user has no membership (security gate for the env /
 * preview tooling exposed to the cloud UI).
 */
export const getConnectedRepoForMember = internalQuery({
  args: {
    semanticIdentifier: v.string(),
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("project"),
      sandbox_id: v.optional(v.string()),
      packageManager: v.optional(
        v.union(v.literal("pnpm"), v.literal("bun")),
      ),
      preview_command: v.optional(v.string()),
      preview_port: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("project")
      .withIndex("by_semantic_identifier", (q) =>
        q.eq("semantic_identifier", args.semanticIdentifier),
      )
      .first();
    if (!project || project.project_type !== "connected_repo") return null;

    const membership = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", project._id).eq("user", args.userId),
      )
      .first();
    if (!membership) return null;

    return {
      _id: project._id,
      sandbox_id: project.sandbox_id,
      packageManager: project.packageManager,
      preview_command: project.runtime_config?.preview_command,
      preview_port: project.runtime_config?.preview_port,
    };
  },
});

/**
 * Internal: merge a partial runtime_config into the project. Used by the
 * agent's set_runtime_config tool and the environment-interpretation step.
 */
export const updateRuntimeConfig = internalMutation({
  args: {
    projectId: v.id("project"),
    config: runtimeConfigValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const merged = { ...(project.runtime_config ?? {}), ...args.config };
    await ctx.db.patch(args.projectId, { runtime_config: merged });
    return null;
  },
});

/** Internal: update the connected-repo preview URL. */
export const setConnectedRepoPreviewUrl = internalMutation({
  args: {
    projectId: v.id("project"),
    preview_url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { preview_url: args.preview_url });
    return null;
  },
});

/** Internal: update the current branch for a connected-repo project. */
export const setCurrentBranch = internalMutation({
  args: {
    projectId: v.id("project"),
    branch: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { current_branch: args.branch });
    return null;
  },
});

// Re-export the Id type usage so this module's generated API is stable.
export type ConnectedRepoProjectId = Id<"project">;
