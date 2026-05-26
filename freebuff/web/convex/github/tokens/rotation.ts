"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

/**
 * Token rotation service for GitHub integration
 * Handles automatic rotation of installation tokens and OAuth access tokens
 */

interface TokenRotationResult {
  success: boolean;
  connectionId: string;
  tokenType: "installation" | "oauth";
  error?: string;
  newExpiresAt?: number;
}

/**
 * Rotate installation token for a specific connection
 *
 * OPTIMIZED: Removed redundant getConnectionById call (was 61k calls/day just for logging).
 * Old expiry time now passed as optional arg instead of fetching from DB.
 */
export const rotateInstallationToken = internalAction({
  args: {
    connectionId: v.id("github_connections"),
    installationId: v.number(),
    userId: v.optional(v.id("users")), // For logging purposes
    oldExpiresAt: v.optional(v.number()), // OPTIMIZATION: Pass this instead of fetching
    rotationTriggered: v.optional(
      v.union(
        v.literal("cron"),
        v.literal("just_in_time"),
        v.literal("manual"),
      ),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    newExpiresAt: v.optional(v.number()),
    skipped: v.optional(v.boolean()), // Indicates rotation was skipped (not an error)
  }),
  handler: async (ctx, args) => {
    const rotationTriggered = args.rotationTriggered || "manual";

    // Try to acquire rotation lock
    const lockResult: { acquired: boolean; reason?: string } =
      await ctx.runMutation(
        internal.github.tokens.queries.tryAcquireRotationLock,
        {
          connectionId: args.connectionId,
        },
      );

    if (!lockResult.acquired) {
      // Another process is already rotating this connection - this is normal, not an error
      console.log(
        `[Installation Rotation] Skipping rotation for connection ${args.connectionId}: ${lockResult.reason}`,
      );
      return {
        success: false,
        error: lockResult.reason,
        skipped: true,
      };
    }

    let lockClearedWithTokenWrite = false;
    try {
      // Get new installation access token using centralized service
      const { createOctokitInstance } = await import(
        "../services/octokitService"
      );
      const octokit = await createOctokitInstance(args.installationId);
      const tokenResponse =
        await octokit.rest.apps.createInstallationAccessToken({
          installation_id: args.installationId,
        });

      const newExpiresAt = tokenResponse.data.expires_at
        ? new Date(tokenResponse.data.expires_at).getTime()
        : undefined;

      // Persist token and clear rotation lock in one mutation (reduces function calls)
      await ctx.runMutation(
        internal.github.tokens.queries
          .applyInstallationTokenAndClearRotationLock,
        {
          connectionId: args.connectionId,
          newToken: tokenResponse.data.token,
          expiresAt: newExpiresAt,
        },
      );
      lockClearedWithTokenWrite = true;

      console.log(
        `Successfully rotated installation token for connection: ${args.connectionId}`,
      );

      return {
        success: true,
        newExpiresAt,
      };
    } catch (error) {
      console.error(
        `[Installation Rotation] Failed to rotate installation token for connection ${args.connectionId}:`,
        error,
      );

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      if (!lockClearedWithTokenWrite) {
        await ctx.runMutation(
          internal.github.tokens.queries.releaseRotationLock,
          {
            connectionId: args.connectionId,
          },
        );
      }
    }
  },
});

/**
 * Rotate OAuth access token using refresh token
 *
 * OPTIMIZED: Removed redundant getConnectionById call.
 * Old expiry time now passed as optional arg instead of fetching from DB.
 */
export const rotateOAuthToken = internalAction({
  args: {
    connectionId: v.id("github_connections"),
    refreshToken: v.string(),
    userId: v.optional(v.id("users")), // For logging purposes
    oldExpiresAt: v.optional(v.number()), // OPTIMIZATION: Pass this instead of fetching
    rotationTriggered: v.optional(
      v.union(
        v.literal("cron"),
        v.literal("just_in_time"),
        v.literal("manual"),
      ),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    newExpiresAt: v.optional(v.number()),
    skipped: v.optional(v.boolean()), // Indicates rotation was skipped (not an error)
  }),
  handler: async (ctx, args) => {
    const rotationTriggered = args.rotationTriggered || "manual";

    // Try to acquire rotation lock
    const lockResult: { acquired: boolean; reason?: string } =
      await ctx.runMutation(
        internal.github.tokens.queries.tryAcquireRotationLock,
        {
          connectionId: args.connectionId,
        },
      );

    if (!lockResult.acquired) {
      // Another process is already rotating this connection - this is normal, not an error
      console.log(
        `[OAuth Rotation] Skipping rotation for connection ${args.connectionId}: ${lockResult.reason}`,
      );
      return {
        success: false,
        error: lockResult.reason,
        skipped: true,
      };
    }

    let lockClearedWithTokenWrite = false;
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("GitHub OAuth credentials not configured");
      }

      // Exchange refresh token for new access token
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: args.refreshToken,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `GitHub OAuth refresh failed: ${response.status} ${response.statusText}`,
        );
      }

      const tokenData = await response.json();

      if (tokenData.error) {
        throw new Error(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
        );
      }

      const newExpiresAt = tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : undefined;

      await ctx.runMutation(
        internal.github.tokens.queries.applyOAuthTokenAndClearRotationLock,
        {
          connectionId: args.connectionId,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || args.refreshToken,
          expiresAt: newExpiresAt,
        },
      );
      lockClearedWithTokenWrite = true;

      console.log(
        `Successfully rotated OAuth token for connection: ${args.connectionId}`,
      );

      return {
        success: true,
        newExpiresAt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if error is due to refresh token already being used (race condition)
      const isRefreshTokenError =
        errorMessage.includes("refresh token") &&
        (errorMessage.includes("incorrect") ||
          errorMessage.includes("expired") ||
          errorMessage.includes("invalid"));

      if (isRefreshTokenError) {
        // This likely means another process already rotated the token successfully
        console.log(
          `[OAuth Rotation] Refresh token already used for connection ${args.connectionId} - likely rotated by concurrent process`,
        );
      } else {
        // This is a real error that needs attention
        console.error(
          `[OAuth Rotation] Failed to rotate OAuth token for connection ${args.connectionId}:`,
          error,
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      if (!lockClearedWithTokenWrite) {
        await ctx.runMutation(
          internal.github.tokens.queries.releaseRotationLock,
          {
            connectionId: args.connectionId,
          },
        );
      }
    }
  },
});

/**
 * Check if a token is expired or will expire soon
 */
export const isTokenExpired = (
  expiresAt: number | undefined,
  bufferMinutes: number = 5,
): boolean => {
  if (!expiresAt) return false;

  const bufferTime = bufferMinutes * 60 * 1000;
  const expiryWithBuffer = expiresAt - bufferTime;

  return Date.now() >= expiryWithBuffer;
};

/**
 * Batch rotate tokens for multiple connections
 */
export const batchRotateTokens = internalAction({
  args: {
    connectionIds: v.array(v.id("github_connections")),
  },
  returns: v.array(
    v.object({
      connectionId: v.id("github_connections"),
      results: v.array(
        v.object({
          tokenType: v.union(v.literal("installation"), v.literal("oauth")),
          success: v.boolean(),
          error: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const results = [];

    for (const connectionId of args.connectionIds) {
      // Get connection details
      const connection = await ctx.runQuery(
        internal.github.auth.connections.getConnectionById,
        {
          connectionId,
        },
      );

      if (!connection) {
        results.push({
          connectionId,
          results: [
            {
              tokenType: "installation" as const,
              success: false,
              error: "Connection not found",
            },
          ],
        });
        continue;
      }

      const tokenResults: Array<{
        tokenType: "installation" | "oauth";
        success: boolean;
        error?: string;
      }> = [];

      // Rotate installation token if needed and possible
      if (
        connection.installation_id &&
        connection.installation_token_expires_at &&
        isTokenExpired(connection.installation_token_expires_at, 5)
      ) {
        const result = await ctx.runAction(
          internal.github.tokens.rotation.rotateInstallationToken,
          {
            connectionId,
            installationId: connection.installation_id,
            userId: connection.user_id,
            oldExpiresAt: connection.installation_token_expires_at, // Pass for logging
            rotationTriggered: "manual",
          },
        );

        tokenResults.push({
          tokenType: "installation",
          success: result.success,
          error: result.error,
        });
      }

      // Rotate OAuth token if needed and possible
      if (
        connection.refresh_token &&
        connection.token_expires_at &&
        isTokenExpired(connection.token_expires_at, 5)
      ) {
        const result = await ctx.runAction(
          internal.github.tokens.rotation.rotateOAuthToken,
          {
            connectionId,
            refreshToken: connection.refresh_token,
            userId: connection.user_id,
            oldExpiresAt: connection.token_expires_at, // Pass for logging
            rotationTriggered: "manual",
          },
        );

        tokenResults.push({
          tokenType: "oauth",
          success: result.success,
          error: result.error,
        });
      }

      results.push({
        connectionId,
        results: tokenResults,
      });
    }

    return results;
  },
});

/**
 * Scheduled token rotation job
 * Called by cron to proactively rotate tokens before they expire
 *
 * OPTIMIZED: Processes rotations in parallel batches and pre-fetches all connection data
 */
export const scheduleTokenRotation = internalAction({
  args: {},
  returns: v.object({
    connectionsProcessed: v.number(),
    successfulRotations: v.number(),
    failedRotations: v.number(),
    details: v.array(
      v.object({
        connectionId: v.string(),
        tokenTypes: v.array(
          v.union(v.literal("installation"), v.literal("oauth")),
        ),
        success: v.boolean(),
        errors: v.optional(v.array(v.string())),
      }),
    ),
  }),
  handler: async (
    ctx,
  ): Promise<{
    connectionsProcessed: number;
    successfulRotations: number;
    failedRotations: number;
    details: Array<{
      connectionId: string;
      tokenTypes: Array<"installation" | "oauth">;
      success: boolean;
      errors?: string[];
    }>;
  }> => {
    console.log("Starting scheduled token rotation...");

    // Get tokens expiring in the next 45 minutes with full connection data
    const expiringConnections = await ctx.runQuery(
      internal.github.tokens.queries.getExpiringTokensWithRefreshTokens,
      {
        withinMinutes: 45,
      },
    );

    if (expiringConnections.length === 0) {
      console.log("No tokens need rotation at this time");
      return {
        connectionsProcessed: 0,
        successfulRotations: 0,
        failedRotations: 0,
        details: [],
      };
    }

    console.log(
      `Found ${expiringConnections.length} connections with expiring tokens`,
    );

    // Process rotations in parallel batches of 30 to avoid overwhelming the system
    const BATCH_SIZE = 30;
    let successfulRotations: number = 0;
    let failedRotations: number = 0;
    const details: Array<{
      connectionId: string;
      tokenTypes: Array<"installation" | "oauth">;
      success: boolean;
      errors?: string[];
    }> = [];

    for (let i = 0; i < expiringConnections.length; i += BATCH_SIZE) {
      const batch = expiringConnections.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (connection: any) => {
          const connectionErrors: string[] = [];
          const rotatedTokenTypes: ("installation" | "oauth")[] = [];

          try {
            // Rotate installation token if needed
            if (
              connection.tokenTypes.includes("installation") &&
              connection.installation_id
            ) {
              const result = await ctx.runAction(
                internal.github.tokens.rotation.rotateInstallationToken,
                {
                  connectionId: connection._id,
                  installationId: connection.installation_id,
                  userId: connection.user_id,
                  oldExpiresAt: connection.installation_token_expires_at,
                  rotationTriggered: "cron",
                },
              );

              if (result.success) {
                rotatedTokenTypes.push("installation");
              } else if (!result.skipped) {
                // Only count as failure if not skipped due to lock
                connectionErrors.push(
                  `Installation token: ${result.error || "Unknown error"}`,
                );
              }
            }

            // Rotate OAuth token if needed (using pre-fetched refresh_token)
            if (
              connection.tokenTypes.includes("oauth") &&
              connection.refresh_token
            ) {
              const result = await ctx.runAction(
                internal.github.tokens.rotation.rotateOAuthToken,
                {
                  connectionId: connection._id,
                  refreshToken: connection.refresh_token,
                  userId: connection.user_id,
                  oldExpiresAt: connection.token_expires_at,
                  rotationTriggered: "cron",
                },
              );

              if (result.success) {
                rotatedTokenTypes.push("oauth");
              } else if (!result.skipped) {
                connectionErrors.push(
                  `OAuth token: ${result.error || "Unknown error"}`,
                );
              }
            } else if (connection.tokenTypes.includes("oauth")) {
              connectionErrors.push("OAuth token: No refresh token available");
            }

            return {
              connectionId: connection._id as string,
              tokenTypes: rotatedTokenTypes,
              success: connectionErrors.length === 0,
              errors:
                connectionErrors.length > 0 ? connectionErrors : undefined,
              successCount: rotatedTokenTypes.length,
              failureCount: connectionErrors.length,
            };
          } catch (error) {
            console.error(
              `Error processing connection ${connection._id}:`,
              error,
            );
            return {
              connectionId: connection._id as string,
              tokenTypes: [],
              success: false,
              errors: [
                `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
              ],
              successCount: 0,
              failureCount: 1,
            };
          }
        }),
      );

      // Aggregate batch results
      for (const result of batchResults) {
        successfulRotations += result.successCount;
        failedRotations += result.failureCount;
        details.push({
          connectionId: result.connectionId,
          tokenTypes: result.tokenTypes,
          success: result.success,
          errors: result.errors,
        });
      }
    }

    console.log(
      `Token rotation completed. Successful: ${successfulRotations}, Failed: ${failedRotations}`,
    );

    return {
      connectionsProcessed: expiringConnections.length,
      successfulRotations,
      failedRotations,
      details,
    };
  },
});
