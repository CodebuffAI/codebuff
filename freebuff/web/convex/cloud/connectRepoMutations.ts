import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { allProjects, cloudProjectsByTypeDay, projectsByDay } from "../aggregates/admin_aggregates";
import {
  checkUserRateLimit,
  peekFreebuffDailyQuota,
} from "../coding_agent/rateLimiter";
import { getAuthUser, getQualifiedReferralCount } from "../users";
import { getUniqueProjectIdentifier } from "../codesandbox/projectCrud";

/** Shape of the cached git status (mirrors CloudGitStatus in cloud/git.ts). */
const gitStatusFields = {
  currentBranch: v.string(),
  defaultBranch: v.union(v.string(), v.null()),
  branches: v.array(v.string()),
  isDirty: v.boolean(),
  changedFiles: v.number(),
  insertions: v.number(),
  deletions: v.number(),
  ahead: v.number(),
  behind: v.number(),
  hasUpstream: v.boolean(),
  behindDefault: v.number(),
  repoFullName: v.union(v.string(), v.null()),
};

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
    sandbox_size: v.optional(
      v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
    ),
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
      sandbox_size: args.sandbox_size ?? "small",
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
      await cloudProjectsByTypeDay.insert(ctx, newProject);
    }

    return { projectId, semanticIdentifier };
  },
});

export const consumeConnectRepoQuota = internalMutation({
  args: {
    freebuffModel: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ success: v.literal(true) }),
    v.object({
      success: v.literal(false),
      error: v.object({
        kind: v.string(),
        retryAfter: v.number(),
        message: v.string(),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return {
        success: false as const,
        error: {
          kind: "AUTH_ERROR",
          retryAfter: 0,
          message: "User not found",
        },
      };
    }

    // God-role users bypass all usage limits (mirrors runTriggerGates).
    if (user.role === "god") {
      return { success: true as const };
    }

    // Key the buckets the same way the message path does
    // (getRateLimitKeyForUser) so Cloud shares one allowance with web chat /
    // project creation instead of accumulating in a separate bucket.
    const identity = await ctx.auth.getUserIdentity();
    const rateLimitKey =
      user.freebuff_user_id ?? user.clerk_id ?? user._id;
    const qualifiedReferralCount = getQualifiedReferralCount(identity, user);

    // Daily maximum: refuse to boot a sandbox when the user has no daily
    // Freebuff allowance left. This is a non-consuming peek — the seed message
    // consumes the actual token later via runTriggerGates, so there's no
    // double charge for a successful connect.
    const daily = await peekFreebuffDailyQuota(
      ctx,
      rateLimitKey,
      args.freebuffModel,
      qualifiedReferralCount,
    );
    if (!daily.success) return daily;

    // Burst protection: shared userMessages token bucket (20/hr, capacity 10).
    return await checkUserRateLimit(ctx, rateLimitKey);
  },
});

/**
 * Internal: soft-delete a connected-repo project. Used to roll back a connect
 * when the first agent run can't start, so a half-created project never lingers
 * in the user's Cloud dashboard. Sandbox teardown is handled separately in the
 * action (Daytona delete) since it requires the node runtime.
 */
export const softDeleteConnectedRepoProject = internalMutation({
  args: { projectId: v.id("project") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project && !project.deleted) {
      await ctx.db.patch(args.projectId, { deleted: true });
    }
    return null;
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
      build_command: v.optional(v.string()),
      preview_url: v.optional(v.string()),
      current_branch: v.optional(v.string()),
      repo_default_branch: v.optional(v.string()),
      repo_full_name: v.optional(v.string()),
      github_installation_id: v.optional(v.number()),
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


    return {
      _id: project._id,
      sandbox_id: project.sandbox_id,
      packageManager: project.packageManager,
      preview_command: project.runtime_config?.preview_command,
      preview_port: project.runtime_config?.preview_port,
      build_command: project.runtime_config?.build_command,
      preview_url: project.preview_url,
      current_branch: project.current_branch,
      repo_default_branch: project.repo_default_branch,
      repo_full_name: project.repo_full_name,
      github_installation_id: project.github_installation_id,
    };
  },
});

/**
 * Internal: merge a partial runtime_config into the project. Used by the
 * agent's `freebuff-preview` pseudo-CLI and the Cloud settings UI.
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

/** Internal: persist the freshly computed git status for a connected repo so
 *  the top-bar controls can read it from a cheap reactive query (no sandbox). */
export const setGitStatusCache = internalMutation({
  args: {
    projectId: v.id("project"),
    status: v.object(gitStatusFields),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      git_status_cache: { ...args.status, updatedAt: Date.now() },
    });
    return null;
  },
});

/**
 * Public: read the cached git status for a connected-repo project (member
 * only). This is a plain DB read — it never touches the sandbox, so the UI can
 * render git details continuously and reactively for ~free. The action
 * `cloud.git.getGitStatus` is what refreshes this cache on demand.
 */
export const getCachedGitStatus = query({
  args: { semanticIdentifier: v.string() },
  returns: v.union(
    v.object({ ...gitStatusFields, updatedAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

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
        q.eq("project", project._id).eq("user", user._id),
      )
      .first();
    if (!membership) return null;

    return project.git_status_cache ?? null;
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
