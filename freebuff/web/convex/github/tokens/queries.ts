import { v } from "convex/values";
import { internalQuery, internalMutation } from "../../_generated/server";

/**
 * Token-related queries and mutations that don't require Node.js runtime
 */

/**
 * Get all connections with tokens expiring soon (legacy version)
 */
export const getExpiringTokens = internalQuery({
  args: {
    withinMinutes: v.optional(v.number()), // Default: 60 minutes
  },
  returns: v.array(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      installation_id: v.optional(v.number()),
      installation_token_expires_at: v.optional(v.number()),
      token_expires_at: v.optional(v.number()),
      tokenTypes: v.array(
        v.union(v.literal("installation"), v.literal("oauth")),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const withinMinutes = args.withinMinutes || 60;
    const thresholdTime = Date.now() + withinMinutes * 60 * 1000;

    // OPTIMIZED: Use compound index range query to exclude undefined at index level
    // Range query: null <= installation_token_expires_at <= thresholdTime
    const connectionsWithExpiringInstallation = await ctx.db
      .query("github_connections")
      .withIndex("by_installation_token_expires_at", (q) =>
        q
          .gte("installation_token_expires_at", null as any)
          .lte("installation_token_expires_at", thresholdTime),
      )
      .collect();

    // OPTIMIZED: Use compound index range query to exclude undefined at index level
    // Range query: null <= token_expires_at <= thresholdTime
    const connectionsWithExpiringOAuth = await ctx.db
      .query("github_connections")
      .withIndex("by_token_expires_at", (q) =>
        q
          .gte("token_expires_at", null as any)
          .lte("token_expires_at", thresholdTime),
      )
      .collect();

    // Build a map to deduplicate and track which token types are expiring
    const connectionMap = new Map<
      string,
      {
        connection: (typeof connectionsWithExpiringInstallation)[0];
        tokenTypes: Set<"installation" | "oauth">;
      }
    >();

    // Process installation token expirations
    for (const conn of connectionsWithExpiringInstallation) {
      if (!connectionMap.has(conn._id)) {
        connectionMap.set(conn._id, {
          connection: conn,
          tokenTypes: new Set(),
        });
      }
      connectionMap.get(conn._id)!.tokenTypes.add("installation");
    }

    // Process OAuth token expirations
    for (const conn of connectionsWithExpiringOAuth) {
      if (!connectionMap.has(conn._id)) {
        connectionMap.set(conn._id, {
          connection: conn,
          tokenTypes: new Set(),
        });
      }
      connectionMap.get(conn._id)!.tokenTypes.add("oauth");
    }

    // Convert to output format
    return Array.from(connectionMap.values()).map(
      ({ connection, tokenTypes }) => ({
        _id: connection._id,
        user_id: connection.user_id,
        installation_id: connection.installation_id,
        installation_token_expires_at: connection.installation_token_expires_at,
        token_expires_at: connection.token_expires_at,
        tokenTypes: Array.from(tokenTypes),
      }),
    );
  },
});

/**
 * Get all connections with tokens expiring soon (optimized version with refresh tokens)
 * Pre-fetches refresh_token to avoid redundant queries in scheduleTokenRotation
 *
 * DATA READ OPTIMIZATION NOTE:
 * This function reads ~1.4MB because each github_connections document contains large encrypted
 * token fields (access_token, refresh_token, installation_token = ~20-50KB each).
 * Reading 1.4MB typically means ~20-50 connections are expiring.
 *
 * EXPECTED BEHAVIOR:
 * - Normal: 5-20 connections expiring within the rotation window (300-700KB)
 * - High usage: 20-50 connections (1-2MB) - acceptable if you have many users
 * - Problem: >50 connections (>2MB) - may indicate token rotation schedule needs adjustment
 *
 * If data reads are consistently >2MB, consider:
 * 1. Increasing rotation frequency to reduce batch sizes
 * 2. Checking if token expiration times are properly staggered
 * 3. Investigating if encryption is making tokens unnecessarily large
 */
export const getExpiringTokensWithRefreshTokens = internalQuery({
  args: {
    withinMinutes: v.optional(v.number()), // Default: 60 minutes
  },
  returns: v.array(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      installation_id: v.optional(v.number()),
      installation_token_expires_at: v.optional(v.number()),
      token_expires_at: v.optional(v.number()),
      refresh_token: v.optional(v.string()), // Pre-fetched for OAuth rotation
      tokenTypes: v.array(
        v.union(v.literal("installation"), v.literal("oauth")),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const withinMinutes = args.withinMinutes || 60;
    // Round to nearest 5 minutes for better caching
    // This groups all token rotation checks within a 5-minute window
    const roundedNow =
      Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const thresholdTime = roundedNow + withinMinutes * 60 * 1000;

    // OPTIMIZED: Use compound index range query to exclude undefined at index level
    // This reads only documents where installation_token_expires_at is defined AND <= thresholdTime
    // Range query: null <= installation_token_expires_at <= thresholdTime
    // (In Convex ordering: undefined < null < numbers, so gte(null) excludes undefined)
    const connectionsWithExpiringInstallation = await ctx.db
      .query("github_connections")
      .withIndex("by_installation_token_expires_at", (q) =>
        q
          .gte("installation_token_expires_at", null as any)
          .lte("installation_token_expires_at", thresholdTime),
      )
      .collect();

    // OPTIMIZED: Use compound index range query to exclude undefined at index level
    // Range query: null <= token_expires_at <= thresholdTime
    const connectionsWithExpiringOAuth = await ctx.db
      .query("github_connections")
      .withIndex("by_token_expires_at", (q) =>
        q
          .gte("token_expires_at", null as any)
          .lte("token_expires_at", thresholdTime),
      )
      .collect();

    // Build a map to deduplicate and track which token types are expiring
    const connectionMap = new Map<
      string,
      {
        connection: (typeof connectionsWithExpiringInstallation)[0];
        tokenTypes: Set<"installation" | "oauth">;
      }
    >();

    // Process installation token expirations
    for (const conn of connectionsWithExpiringInstallation) {
      if (!connectionMap.has(conn._id)) {
        connectionMap.set(conn._id, {
          connection: conn,
          tokenTypes: new Set(),
        });
      }
      connectionMap.get(conn._id)!.tokenTypes.add("installation");
    }

    // Process OAuth token expirations
    for (const conn of connectionsWithExpiringOAuth) {
      if (!connectionMap.has(conn._id)) {
        connectionMap.set(conn._id, {
          connection: conn,
          tokenTypes: new Set(),
        });
      }
      connectionMap.get(conn._id)!.tokenTypes.add("oauth");
    }

    // Convert to output format with refresh_token included
    return Array.from(connectionMap.values()).map(
      ({ connection, tokenTypes }) => ({
        _id: connection._id,
        user_id: connection.user_id,
        installation_id: connection.installation_id,
        installation_token_expires_at: connection.installation_token_expires_at,
        token_expires_at: connection.token_expires_at,
        refresh_token: connection.refresh_token, // Include for OAuth rotation
        tokenTypes: Array.from(tokenTypes),
      }),
    );
  },
});

/**
 * Update installation token in database
 */
export const updateInstallationToken = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    newToken: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      installation_token: args.newToken,
      installation_token_expires_at: args.expiresAt,
      updated_at: Date.now(),
    });
  },
});

/** Single mutation: persist new installation token and clear rotation lock (replaces update + release). */
export const applyInstallationTokenAndClearRotationLock = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    newToken: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      installation_token: args.newToken,
      installation_token_expires_at: args.expiresAt,
      rotation_lock_expires_at: undefined,
      updated_at: Date.now(),
    });
  },
});

/**
 * Update OAuth token in database
 */
export const updateOAuthToken = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      access_token: args.accessToken,
      refresh_token: args.refreshToken,
      token_expires_at: args.expiresAt,
      updated_at: Date.now(),
    });
  },
});

/** Single mutation: persist OAuth tokens and clear rotation lock. */
export const applyOAuthTokenAndClearRotationLock = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      access_token: args.accessToken,
      refresh_token: args.refreshToken,
      token_expires_at: args.expiresAt,
      rotation_lock_expires_at: undefined,
      updated_at: Date.now(),
    });
  },
});

/**
 * Try to acquire a rotation lock for a connection
 * Returns true if lock was acquired, false if already held by another process
 *
 * OPTIMIZED: Directly fetches the specific connection by ID to check lock status.
 * This reads only 1 document instead of scanning all connections with active locks.
 * Previous implementation scanned 20,000+ documents; this reduces reads by 99.995%.
 */
export const tryAcquireRotationLock = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    lockDurationMs: v.optional(v.number()), // Default: 5 minutes
  },
  returns: v.object({
    acquired: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const lockDurationMs = args.lockDurationMs || 5 * 60 * 1000; // 5 minutes default
    const now = Date.now();
    const lockExpiresAt = now + lockDurationMs;

    // OPTIMIZED: Directly fetch the specific connection by ID instead of scanning all active locks
    // This reads only 1 document instead of 20,000+ documents
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      return { acquired: false, reason: "Connection not found" };
    }

    // Check if this connection has an active lock
    if (
      connection.rotation_lock_expires_at &&
      connection.rotation_lock_expires_at >= now
    ) {
      return {
        acquired: false,
        reason: "Lock already held by another process",
      };
    }

    // No active lock exists - acquire the lock
    await ctx.db.patch(args.connectionId, {
      rotation_lock_expires_at: lockExpiresAt,
    });

    return { acquired: true };
  },
});

/**
 * Release a rotation lock for a connection
 */
export const releaseRotationLock = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      rotation_lock_expires_at: undefined,
    });
  },
});
