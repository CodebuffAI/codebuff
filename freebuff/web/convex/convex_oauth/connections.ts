import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { getAuthUser } from "../users";

/**
 * Store a new Convex OAuth connection (internal only)
 */
export const storeConnection = internalMutation({
  args: {
    user_id: v.id("users"),
    projectId: v.optional(v.id("project")),

    // OAuth tokens (ENCRYPTED)
    access_token: v.string(),
    refresh_token: v.optional(v.string()),
    token_expires_at: v.optional(v.number()),

    // Convex project info (optional for pending_setup state)
    convex_project_id: v.optional(v.number()),
    project_slug: v.optional(v.string()),
    team_slug: v.optional(v.string()),

    // Deployment info (optional for pending_setup state)
    dev_deployment_name: v.optional(v.string()),
    dev_deployment_url: v.optional(v.string()),
    prod_deployment_name: v.optional(v.string()),
    prod_deployment_url: v.optional(v.string()),

    // Deploy keys (ENCRYPTED) - optional for pending_setup state
    dev_deploy_key: v.optional(v.string()),
    dev_deploy_key_name: v.optional(v.string()),
    prod_deploy_key: v.optional(v.string()),
    prod_deploy_key_name: v.optional(v.string()),

    // Metadata
    connection_type: v.union(
      v.literal("migrated"),
      v.literal("self_hosted"),
      v.literal("oauth_pending_setup"),
    ),
    is_active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const connectionId = await ctx.db.insert("convex_connections", {
      user_id: args.user_id,
      projectId: args.projectId,

      access_token: args.access_token,
      refresh_token: args.refresh_token,
      token_expires_at: args.token_expires_at,

      convex_project_id: args.convex_project_id,
      project_slug: args.project_slug,
      team_slug: args.team_slug,

      dev_deployment_name: args.dev_deployment_name,
      dev_deployment_url: args.dev_deployment_url,
      prod_deployment_name: args.prod_deployment_name,
      prod_deployment_url: args.prod_deployment_url,

      dev_deploy_key: args.dev_deploy_key,
      dev_deploy_key_name: args.dev_deploy_key_name,
      prod_deploy_key: args.prod_deploy_key,
      prod_deploy_key_name: args.prod_deploy_key_name,

      connection_type: args.connection_type,
      is_active: args.is_active,
      created_at: now,
      updated_at: now,
    });

    console.log("[Convex Connection] Stored:", {
      connectionId,
      user_id: args.user_id,
      projectId: args.projectId,
      dev_deployment: args.dev_deployment_name,
    });

    return connectionId;
  },
});

export const updateConnectionProdDeployment = internalMutation({
  args: {
    connectionId: v.id("convex_connections"),
    prod_deployment_name: v.string(),
    prod_deployment_url: v.string(),
    prod_deploy_key: v.string(),
    prod_deploy_key_name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      prod_deployment_name: args.prod_deployment_name,
      prod_deployment_url: args.prod_deployment_url,
      prod_deploy_key: args.prod_deploy_key,
      prod_deploy_key_name: args.prod_deploy_key_name,
      updated_at: Date.now(),
    });
  },
});

/**
 * Get connection by ID with decrypted tokens (internal only - for migration/API use)
 */
export const getConnectionWithTokens = internalQuery({
  args: {
    connectionId: v.id("convex_connections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      return null;
    }

    // Decrypt tokens using the crypto action
    // NOTE: We can't call actions from queries, so the decryption will need to be done
    // in an action that calls this query first, then decrypts in the action layer
    // For now, return encrypted values - decryption happens in the action layer

    return connection as any;
  },
});

/**
 * Get connection by project ID (internal only)
 * Used to check if a project is self-hosted before deployment
 */
export const getConnectionByProjectId = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("convex_connections")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("is_active"), true))
      .first();

    return connection;
  },
});

export const isProjectSelfHosted = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return false;

    const connection = await ctx.db
      .query("convex_connections")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("is_active"), true))
      .first();

    return !!connection;
  },
});
