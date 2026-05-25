"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

/**
 * Just-in-time token validation and rotation service
 * This ensures tokens are valid before being used in operations
 */

/**
 * Get a valid GitHub connection with automatic token rotation
 *
 * OPTIMIZED: Now relies on cron-based rotation (every 30min) for 95% of cases.
 * Only rotates just-in-time if token is ACTUALLY expired (no 5min buffer).
 * Uses lightweight checkTokenValidity query that benefits from Convex's automatic caching.
 *
 * This function should be called before any GitHub API operations.
 */
export const getValidGitHubConnection = internalAction({
  args: {
    userId: v.id("users"),
    forceRotation: v.optional(v.boolean()), // Force rotation even if not expired
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
      rotated: v.object({
        installation_token: v.boolean(),
        oauth_token: v.boolean(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<any> => {
    // OPTIMIZATION: Use lightweight validity check first (auto-cached by Convex)
    const validity = await ctx.runQuery(
      internal.github.auth.connections.checkTokenValidity,
      { userId: args.userId },
    );

    if (!validity) {
      return null;
    }

    const rotated = {
      installation_token: false,
      oauth_token: false,
    };

    // OPTIMIZATION: Only rotate if token is ACTUALLY expired (not 5 min before)
    // Cron job handles proactive rotation every 30 min, so this is rare
    if (
      validity.installation_id &&
      validity.installation_token &&
      (args.forceRotation || validity.installation_token_expired)
    ) {
      console.log(
        `[JIT Rotation] Installation token expired for user: ${args.userId}`,
      );

      // Fetch full connection to get old expiry time for logging
      const connection = await ctx.runQuery(
        internal.github.auth.connections.getGitHubConnectionWithTokensInternal,
        { userId: args.userId },
      );

      const rotationResult = await ctx.runAction(
        internal.github.tokens.rotation.rotateInstallationToken,
        {
          connectionId: validity.connectionId,
          installationId: validity.installation_id,
          userId: args.userId,
          oldExpiresAt: connection?.installation_token_expires_at, // Pass for logging
          rotationTriggered: "just_in_time",
        },
      );

      if (rotationResult.success) {
        rotated.installation_token = true;
        console.log(
          `[JIT Rotation] Successfully rotated installation token for user: ${args.userId}`,
        );
      } else if (rotationResult.skipped) {
        // Another process is handling rotation - this is normal
        console.log(
          `[JIT Rotation] Installation token rotation already in progress for user ${args.userId}, continuing with existing token`,
        );
      } else {
        console.error(
          `[JIT Rotation] Failed to rotate installation token for user ${args.userId}: ${rotationResult.error}`,
        );
        // Continue with existing token - it might still work
      }
    }

    // OPTIMIZATION: Only rotate OAuth if ACTUALLY expired
    if (
      validity.has_refresh_token &&
      (args.forceRotation || validity.oauth_token_expired)
    ) {
      console.log(
        `[JIT Rotation] OAuth token expired for user: ${args.userId}`,
      );

      // Need full connection for refresh token
      const connection = await ctx.runQuery(
        internal.github.auth.connections.getGitHubConnectionWithTokensInternal,
        { userId: args.userId },
      );

      if (connection?.refresh_token) {
        const rotationResult = await ctx.runAction(
          internal.github.tokens.rotation.rotateOAuthToken,
          {
            connectionId: connection._id,
            refreshToken: connection.refresh_token,
            userId: args.userId,
            oldExpiresAt: connection.token_expires_at, // Pass for logging
            rotationTriggered: "just_in_time",
          },
        );

        if (rotationResult.success) {
          rotated.oauth_token = true;
          console.log(
            `[JIT Rotation] Successfully rotated OAuth token for user: ${args.userId}`,
          );
        } else if (rotationResult.skipped) {
          // Another process is handling rotation - this is normal
          console.log(
            `[JIT Rotation] OAuth token rotation already in progress for user ${args.userId}, continuing with existing token`,
          );
        } else {
          console.error(
            `[JIT Rotation] Failed to rotate OAuth token for user ${args.userId}: ${rotationResult.error}`,
          );
        }
      }
    }

    // Get final connection state
    const finalConnection = await ctx.runQuery(
      internal.github.auth.connections.getGitHubConnectionWithTokensInternal,
      { userId: args.userId },
    );

    if (!finalConnection) {
      return null;
    }

    return {
      ...finalConnection,
      rotated,
    };
  },
});

/**
 * Validate a specific token without rotation
 * Useful for checking token status before operations
 */
export const validateToken = internalAction({
  args: {
    tokenType: v.union(v.literal("installation"), v.literal("oauth")),
    expiresAt: v.optional(v.number()),
    bufferMinutes: v.optional(v.number()),
  },
  returns: v.object({
    valid: v.boolean(),
    expired: v.boolean(),
    expiresIn: v.optional(v.number()), // minutes until expiry
    needsRotation: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const bufferMinutes = args.bufferMinutes || 5;
    const bufferTime = bufferMinutes * 60 * 1000;
    const now = Date.now();

    if (!args.expiresAt) {
      // Token doesn't expire (or no expiry info)
      return {
        valid: true,
        expired: false,
        needsRotation: false,
      };
    }

    const expired = now >= args.expiresAt;
    const needsRotation = now >= args.expiresAt - bufferTime;
    const expiresIn = expired
      ? 0
      : Math.floor((args.expiresAt - now) / (60 * 1000));

    return {
      valid: !expired,
      expired,
      expiresIn,
      needsRotation,
    };
  },
});

/**
 * Test GitHub token validity by making a simple API call
 */
export const testTokenValidity = internalAction({
  args: {
    accessToken: v.string(),
    tokenType: v.union(v.literal("oauth"), v.literal("installation")),
  },
  returns: v.object({
    valid: v.boolean(),
    rateLimitRemaining: v.optional(v.number()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const response = await fetch("https://api.github.com/rate_limit", {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Crack-App/1.0",
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          rateLimitRemaining: data.resources?.core?.remaining,
        };
      } else {
        return {
          valid: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
