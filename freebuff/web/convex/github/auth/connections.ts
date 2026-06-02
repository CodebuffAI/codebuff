import { getAuthUser } from "!/users";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Store GitHub connection
 */
export const storeGitHubConnection = mutation({
  args: {
    user_id: v.id("users"),
    github_user_id: v.string(),
    github_username: v.string(),
    access_token: v.string(),
    refresh_token: v.optional(v.string()),
    token_expires_at: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Feature access is enforced client-side via useFeatureAccess hook.
    // Server-side autumn.check() was incorrectly blocking paying users
    // due to Autumn API sync issues, so the hard gate was removed here.

    const existingConnection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    const connectionData = {
      user_id: args.user_id,
      github_user_id: args.github_user_id,
      github_username: args.github_username,
      access_token: args.access_token,
      refresh_token: args.refresh_token,
      token_expires_at: args.token_expires_at,
      created_at: existingConnection
        ? existingConnection.created_at
        : Date.now(),
      updated_at: Date.now(),
    };

    if (existingConnection) {
      await ctx.db.patch(existingConnection._id, connectionData);
    } else {
      await ctx.db.insert("github_connections", connectionData);
    }
    return null;
  },
});

/**
 * Get GitHub connection
 */
// Internal cacheable version
export const getGitHubConnectionInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();

    if (!connection) return null;

    return {
      github_username: connection.github_username,
      github_user_id: connection.github_user_id,
      repositories: connection.repositories,
      created_at: connection.created_at,
    };
  },
});

export const getGitHubConnection = query({
  args: {},
  handler: async (
    ctx,
    _args,
  ): Promise<{
    github_username: string;
    github_user_id: string;
    repositories?: string[];
    created_at: number;
  } | null> => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    return await ctx.runQuery(
      internal.github.auth.connections.getGitHubConnectionInternal,
      { userId: user._id },
    );
  },
});

/**
 * Disconnect GitHub account
 */
export const disconnectGitHub = mutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, _args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (!connection) {
      return {
        success: false,
        message: "No GitHub connection found",
      };
    }

    await ctx.db.delete(connection._id);

    return {
      success: true,
      message: "GitHub account disconnected successfully",
    };
  },
});

/**
 * Get detailed GitHub connection status
 */
// Internal cacheable version
export const getGitHubConnectionStatusInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();

    if (!connection) {
      return {
        status: "not_connected" as const,
      };
    }

    if (connection.installation_id) {
      return {
        status: "app_installed" as const,
        github_username: connection.github_username,
        github_user_id: connection.github_user_id,
        installation_id: connection.installation_id,
        created_at: connection.created_at,
      };
    } else {
      return {
        status: "user_identified" as const,
        github_username: connection.github_username,
        github_user_id: connection.github_user_id,
        created_at: connection.created_at,
      };
    }
  },
});

export const getGitHubConnectionStatus = query({
  args: {},
  handler: async (
    ctx,
    _args,
  ): Promise<{
    status: "not_connected" | "user_identified" | "app_installed";
    github_username?: string;
    github_user_id?: string;
    installation_id?: number;
    created_at?: number;
  } | null> => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    return await ctx.runQuery(
      internal.github.auth.connections.getGitHubConnectionStatusInternal,
      { userId: user._id },
    );
  },
});

/**
 * Internal function to get GitHub connection with tokens
 */
export const getGitHubConnectionWithTokensInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("github_connections"),
      access_token: v.string(),
      refresh_token: v.optional(v.string()),
      github_username: v.string(),
      github_user_id: v.string(),
      installation_id: v.optional(v.number()),
      installation_token: v.optional(v.string()),
      installation_token_expires_at: v.optional(v.number()),
      token_expires_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();

    if (!connection) return null;

    return {
      _id: connection._id,
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      github_username: connection.github_username,
      github_user_id: connection.github_user_id,
      installation_id: connection.installation_id,
      installation_token: connection.installation_token,
      installation_token_expires_at: connection.installation_token_expires_at,
      token_expires_at: connection.token_expires_at,
    };
  },
});

/**
 * Internal function to store GitHub connection
 */
export const storeGitHubConnectionInternal = internalMutation({
  args: {
    user_id: v.id("users"),
    github_user_id: v.string(),
    github_username: v.string(),
    access_token: v.string(),
    refresh_token: v.optional(v.string()),
    token_expires_at: v.optional(v.number()),
    installation_id: v.optional(v.number()),
    installation_token: v.optional(v.string()),
    installation_token_expires_at: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingConnection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    const connectionData = {
      user_id: args.user_id,
      github_user_id: args.github_user_id,
      github_username: args.github_username,
      access_token: args.access_token,
      refresh_token: args.refresh_token,
      token_expires_at: args.token_expires_at,
      installation_id: args.installation_id,
      installation_token: args.installation_token,
      installation_token_expires_at: args.installation_token_expires_at,
      created_at: existingConnection
        ? existingConnection.created_at
        : Date.now(),
      updated_at: Date.now(),
    };

    if (existingConnection) {
      await ctx.db.patch(existingConnection._id, connectionData);
    } else {
      await ctx.db.insert("github_connections", connectionData);
    }
  },
});

/**
 * Get GitHub connections by GitHub user ID
 */
export const getGitHubConnectionsByGitHubUserId = internalQuery({
  args: {
    githubUserId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      github_user_id: v.string(),
      github_username: v.string(),
      installation_id: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("github_connections")
      .withIndex("by_github_user_id", (q) =>
        q.eq("github_user_id", args.githubUserId),
      )
      .collect();

    return connections.map((connection) => ({
      _id: connection._id,
      user_id: connection.user_id,
      github_user_id: connection.github_user_id,
      github_username: connection.github_username,
      installation_id: connection.installation_id,
    }));
  },
});

/**
 * Get GitHub connections by GitHub user ID without installation ID
 */
export const getGitHubConnectionsByGitHubUserIdWithoutInstallation =
  internalQuery({
    args: {
      githubUserId: v.string(),
    },
    returns: v.array(
      v.object({
        _id: v.id("github_connections"),
        user_id: v.id("users"),
        github_user_id: v.string(),
        github_username: v.string(),
        installation_id: v.optional(v.number()),
      }),
    ),
    handler: async (ctx, args) => {
      const connections = await ctx.db
        .query("github_connections")
        .withIndex("by_github_user_id", (q) =>
          q.eq("github_user_id", args.githubUserId),
        )
        .filter((q) => q.eq(q.field("installation_id"), undefined))
        .collect();

      return connections.map((connection) => ({
        _id: connection._id,
        user_id: connection.user_id,
        github_user_id: connection.github_user_id,
        github_username: connection.github_username,
        installation_id: connection.installation_id,
      }));
    },
  });

/**
 * Get GitHub connections by installation ID
 */
export const getGitHubConnectionsByInstallationId = internalQuery({
  args: {
    installationId: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      github_user_id: v.string(),
      github_username: v.string(),
      installation_id: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("github_connections")
      .filter((q) => q.eq(q.field("installation_id"), args.installationId))
      .collect();

    return connections.map((connection) => ({
      _id: connection._id,
      user_id: connection.user_id,
      github_user_id: connection.github_user_id,
      github_username: connection.github_username,
      installation_id: connection.installation_id,
    }));
  },
});

/**
 * Lightweight token validity check (for serverless caching)
 * Convex automatically caches query results within a single backend request context
 * This reduces redundant database lookups when called multiple times in one workflow
 */
export const checkTokenValidity = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      connectionId: v.id("github_connections"),
      installation_token: v.optional(v.string()),
      installation_token_expired: v.boolean(),
      installation_id: v.optional(v.number()),
      oauth_token_expired: v.boolean(),
      has_refresh_token: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();

    if (!connection) return null;

    const now = Date.now();

    return {
      connectionId: connection._id,
      installation_token: connection.installation_token,
      installation_token_expired: connection.installation_token_expires_at
        ? connection.installation_token_expires_at <= now
        : false,
      installation_id: connection.installation_id,
      oauth_token_expired: connection.token_expires_at
        ? connection.token_expires_at <= now
        : false,
      has_refresh_token: !!connection.refresh_token,
    };
  },
});

/**
 * Get connection by ID
 */
export const getConnectionById = internalQuery({
  args: {
    connectionId: v.id("github_connections"),
  },
  returns: v.union(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      access_token: v.string(),
      refresh_token: v.optional(v.string()),
      github_username: v.string(),
      github_user_id: v.string(),
      installation_id: v.optional(v.number()),
      installation_token: v.optional(v.string()),
      installation_token_expires_at: v.optional(v.number()),
      token_expires_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;

    return {
      _id: connection._id,
      user_id: connection.user_id,
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      github_username: connection.github_username,
      github_user_id: connection.github_user_id,
      installation_id: connection.installation_id,
      installation_token: connection.installation_token,
      installation_token_expires_at: connection.installation_token_expires_at,
      token_expires_at: connection.token_expires_at,
    };
  },
});

/**
 * Update connection tokens
 */
export const updateConnectionTokens = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      access_token: args.accessToken,
      refresh_token: args.refreshToken,
      token_expires_at: args.tokenExpiresAt,
      updated_at: Date.now(),
    });
  },
});
